/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [ "TestRunner" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const defaultSetNames = ["SystemTheme", "Tabs", "WindowSize", "Toolbars", "LightweightThemes"];

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Timer.jsm");
Cu.import("resource://gre/modules/devtools/Console.jsm");
Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js");
Cu.import("resource://gre/modules/osfile.jsm");


function DEBUG(...args) {
  //console.info.apply(this, args);
}

this.TestRunner = {
  completedCombos: 0,
  currentCombo: 0,
  _comboGen: null,
  _lastCombo: null,

  init: function(extensionPath) {
    let screenshotPath;
    switch (Services.appinfo.OS) {
      case "WINNT":
        screenshotPath = "C:\\mozscreenshots\\";
        break;
      case "Darwin":
      case "Linux":
        screenshotPath = "/tmp/mozscreenshots/";
        break;
      default:
        throw new Error("Unknown operating system");
        break;
    }
    screenshotPath += (new Date()).toISOString().replace(/:/g, "-") + "_" + Services.appinfo.OS;
    DEBUG("TestRunner.init");

    let screenshotPrefix = Services.appinfo.appBuildID;
    try {
      // Get the changeset/revision hash from Telemetry and use it instead if possible
      const TelemetryPing = Cc["@mozilla.org/base/telemetry-ping;1"].getService(Ci.nsITelemetryPing);
      // Turn a changeset URI into just the repo name and revision then convert / to - for the filename.
      let changsetURI = Services.io.newURI(TelemetryPing.getPayload().info.revision, null, null);
      screenshotPrefix = changsetURI.path.replace(/\/(rev|projects|integration)\//g, "/")
                                    .substring(1).replace(/\//g, "-");
    } catch (ex) {
      DEBUG("falling back to build ID");
    }

    Screenshot.init(screenshotPath, extensionPath, screenshotPrefix + "_");
    this._libDir = extensionPath.QueryInterface(Ci.nsIFileURL).file.clone();
    this._libDir.append("lib");

    // Setup some prefs
    Services.prefs.setCharPref("extensions.ui.lastCategory", "addons://list/extension");
    Services.prefs.setBoolPref("browser.safebrowsing.enabled", false);
  },

  start: function(setNames = null) {
    setNames = setNames || defaultSetNames;
    let sets = this.loadSets(setNames);

    console.log(sets.length +  " sets:", setNames);
    this.combos = new LazyProduct(sets);
    console.log(this.combos.length + " combinations");

    // Create a generator for all combinations.
    function comboGenerator() {
      for (let i = 0; i < this.combos.length; i++){
        yield this.combos.item(i);
      }
    };

    this._comboGen = comboGenerator.bind(this)();
    this.currentCombo = this.completedCombos = 0;
    this._lastCombo = null;
    this._performCombo();
  },

  loadSets: function(setNames) {
    let sets = [];
    for (let setName of setNames) {
      try {
        let imported = {};
        Cu.import("chrome://mozscreenshots/content/configurations/" + setName + ".jsm", imported);
        imported[setName].init(this._libDir);
        if (imported[setName].configurations.length)
          sets.push(imported[setName].configurations);
      } catch (ex) {
        console.error("Error loading set: " + setName);
        throw ex;
      }
    }
    return sets;
  },

  cleanup: function () {
    let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
    let gBrowser = browserWindow.gBrowser;
    while (gBrowser.tabs.length > 1)
      gBrowser.removeTab(gBrowser.selectedTab, {animate: false});
    gBrowser.selectedBrowser.loadURI("data:text/html,<h1>Done!");
    browserWindow.restore();
    let env = Cc["@mozilla.org/process/environment;1"]
                .getService(Ci.nsIEnvironment);
    if (!env.get("MOZSCREENSHOTS_INTERACTIVE")) {
      Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
    }
  },

  ///// helpers /////

  _performCombo: function () {
    let combo;
    try {
      combo = this._comboGen.next();
    } catch (ex) {
      if (ex instanceof StopIteration) {
        console.log("Done: Completed " + this.completedCombos + " out of " + this.combos.length + " configurations.");
        this.cleanup();
        return;
      }
      console.error(ex);
    }
    console.log("Combination " + padLeft(++this.currentCombo, String(this.combos.length).length) + "/" + this.combos.length + ": " + this._comboName(combo).substring(1));

    function changeConfig(config, deferred) {
      return function () {
        DEBUG("calling " + config.name);
        config(deferred);
        DEBUG("called " + config.name);
      };
    }

    let d = Promise.defer();
    let promise = d.promise;
    combo.forEach(function(config, i) {
      if (!this._lastCombo || combo[i] !== this._lastCombo[i]) {
        let deferred = Promise.defer();
        DEBUG("promising", config.name);
        promise.then(changeConfig(config, deferred), this._configurationRejected.bind(this));
        promise = deferred.promise;
      }
    }.bind(this));

    promise.then(this._configurationReady(combo), this._configurationRejected.bind(this));
    d.resolve();
  },

  _configurationReady: function(combo) {
    return function configurationReadyInner() {
      setTimeout(function delayedScreenshot() {
        Screenshot.captureExternal(padLeft(this.currentCombo, String(this.combos.length).length) + this._comboName(combo),
                                   function afterScreenshot() {
                                     this._lastCombo = combo;
                                     this.completedCombos++;
                                     this._performCombo();
                                   }.bind(this));
      }.bind(this), 0);
    }.bind(this);
  },

  _configurationRejected: function (reason) {
    console.warn("\tskipped configuration: " + reason);
    // Don't set lastCombo here so that we properly know which configurations
    // need to be applied since the last screenshot
    this._performCombo();
  },

  _comboName: function (combo) {
    return combo.reduce(function(a, b) {
      return a + "_" + b.name;
    }, "");
  },
};


/**
 * Helper to lazily compute the Cartesian product of all of the sets of configurations.
 * Source: http://stackoverflow.com/a/9422496 by Phrogz. CC BY-SA 3.0
 **/
function LazyProduct(sets) {
  for (var dm = [], f = 1, l, i = sets.length; i--; f *= l){
    dm[i] = [f, l = sets[i].length];
  }
  this.length = f;
  this.item = function(n) {
    for (var c = [], i = sets.length; i--; )
      c[i] = sets[i][ (n / dm[i][0] << 0) % dm[i][1] ];
    return c;
  };
};

function padLeft(number, width, padding = "0") {
  return padding.repeat(Math.max(0, width - String(number).length)) + number;
}


/////////////////// Screenshot helper //////////////

let Screenshot = {
  _extensionPath: null,
  _path: null,
  _imagePrefix: "",
  _imageExtension: ".png",
  _screenshotFunction: null,

  init: function(path, extensionPath, imagePrefix = "") {
    this._path = path;

    let dir = Cc["@mozilla.org/file/local;1"]
                .createInstance(Ci.nsIFile);
    dir.initWithPath(this._path);
    if (!dir.exists()) {
      dir.create(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0755", 8));
    }

    this._extensionPath = extensionPath;
    this._imagePrefix = imagePrefix;
    switch (Services.appinfo.OS) {
      case "WINNT":
        this._screenshotFunction = this._screenshotWindows;
        break;
      case "Darwin":
        this._screenshotFunction = this._screenshotOSX;
        break;
      case "Linux":
        this._screenshotFunction = this._screenshotLinux;
        break;
      default:
        throw new Error("Unsupported operating system");
        break;
    }
  },

  _buildImagePath: function (baseName) {
    return OS.Path.join(this._path, this._imagePrefix + baseName + this._imageExtension);
  },

  // Capture the whole screen using an external application.
  captureExternal: function(filename, callback) {
    setTimeout(function () {
      this._screenshotFunction(this._buildImagePath(filename), callback);
      DEBUG("saved screenshot: " + filename);
    }.bind(this), 1000); // TODO: test with lower
  },

  ///// helpers /////

  _screenshotWindows: function(filename, callback) {
    let exe = this._extensionPath.QueryInterface(Ci.nsIFileURL).file;
    exe.append("lib");
    exe.append("screenshot.exe");
    let process = Cc["@mozilla.org/process/util;1"]
                    .createInstance(Ci.nsIProcess);
    process.init(exe);

    // Run the process.
    let args = [filename];
    process.runAsync(args, args.length, this._screenshotObserver(callback));
  },

  _screenshotOSX: function(filename, callback) {
    function readWindowID() {
      Components.utils.import("resource://gre/modules/NetUtil.jsm");
      let file = Cc["@mozilla.org/file/local;1"]
                   .createInstance(Ci.nsIFile);
      file.initWithPath("/tmp/mozscreenshots/windowid");

      NetUtil.asyncFetch(file, function(inputStream, status) {
        if (!Components.isSuccessCode(status)) {
          console.log("Error reading windowid");
          return;
        }

        // The file data is contained within inputStream.
        // You can read it into a string with
        var windowID = NetUtil.readInputStreamToString(inputStream, inputStream.available());
        screencapture(windowID);
      });
    }

    let screencapture = function (windowID = null) {
      // Get the screencapture executable
      let file = Cc["@mozilla.org/file/local;1"]
                   .createInstance(Ci.nsIFile);
      file.initWithPath("/usr/sbin/screencapture");

      let process = Cc["@mozilla.org/process/util;1"]
                      .createInstance(Ci.nsIProcess);
      process.init(file);

      // Run the process.
      let args = ['-x', '-t', 'png'];
      if (windowID) {
        // Capture only that window
        args.push('-l');
        args.push(windowID);
      }
      args.push(filename);
      process.runAsync(args, args.length, this._screenshotObserver(callback));
    }.bind(this);

    // Get the window ID of the application (assuming its front-most)
    // TODO: handle capturing unfocused windows by calculating "name_" once
    let osascript = Cc["@mozilla.org/file/local;1"]
                      .createInstance(Ci.nsIFile);
    osascript.initWithPath("/bin/bash");

    let osascriptP = Cc["@mozilla.org/process/util;1"]
                       .createInstance(Ci.nsIProcess);
    osascriptP.init(osascript);
    // -e 'tell application (path to frontmost application as text) to set winID to id of window window_name'
    // -e 'tell application \"System Events\" to set window_name to id of first window of (first application process whose frontmost is true)'
    let osaArgs = ['-c', "/usr/bin/osascript -e 'tell application (path to frontmost application as text) to set winID to id of window 1'  > /tmp/mozscreenshots/windowid"];
    osascriptP.runAsync(osaArgs, osaArgs.length, this._screenshotObserver(readWindowID));
  },

  _screenshotLinux: function(filename, callback) {
    let file = Cc["@mozilla.org/file/local;1"]
                 .createInstance(Ci.nsIFile);
    try {
      file.initWithPath("/usr/bin/scrot");
    } catch (ex) {
      file.initWithPath("/bin/scrot");
    }

    let process = Cc["@mozilla.org/process/util;1"]
                    .createInstance(Ci.nsIProcess);
    process.init(file);

    // Run the process.
    let args = [filename];
    process.runAsync(args, args.length, this._screenshotObserver(callback));
  },

  _screenshotObserver: function (callback) {
    return {
      // nsIObserver implementation
      observe: function (subject, topic, data) {
        switch (topic) {
          case "process-finished":
            if (callback) {
              try {
                setTimeout(callback, 0);
              } catch (ex) {
                console.error(ex);
              }
            }
            break;
          default:
            console.error(topic);
            break;
        };
      },
    };
  },
};
