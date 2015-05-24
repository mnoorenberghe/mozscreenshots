/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Timer.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "TestRunner",
                                  "chrome://mozscreenshots/content/TestRunner.jsm");

// Path to unpacked extension directory
let extensionPath = null;

function install(data, reason) {
  if (!isAppSupported()) {
    uninstallExtension(data);
    return;
  }

  AddonManager.getAddonByID(data.id, function(addon) {
    // Enable on install in case the user disabled a prior version
    if (addon) {
      addon.userDisabled = false;
    }
  });
}

function startup(data, reason) {
  if (!isAppSupported()) {
    uninstallExtension(data);
    return;
  }

  AddonManager.getAddonByID(data.id, function(addon) {
    extensionPath = addon.getResourceURI();

    // Start immediately if the add-on was installed at runtime for mochitest-broswer-chrome.
    if (env.get("MOZ_UPLOAD_DIR")) {
      startRun();
    } else {
      Services.obs.addObserver(observer, "sessionstore-windows-restored", false);
    }
  });
}

function shutdown(data, reason) {
  if (!env.get("MOZ_UPLOAD_DIR")) {
    Services.obs.removeObserver(observer, "sessionstore-windows-restored");
  }
}

function uninstall(data, reason) { }

/**
 * @return boolean whether the test suite applies to the application.
 */
function isAppSupported() {
  return true;
}

function uninstallExtension(data) {
  AddonManager.getAddonByID(data.id, function(addon) {
    addon.uninstall();
  });
}

let observer = {
  // nsIObserver implementation
  observe: function BG_observe(subject, topic, data) {
    switch (topic) {
      case "sessionstore-windows-restored":
        setTimeout(startRun, 500);
        break;
    };
  },
};

function startRun() {
  let env = Cc["@mozilla.org/process/environment;1"]
              .getService(Ci.nsIEnvironment);
  let setsEnv = env.get("MOZSCREENSHOTS_SETS");
  let sets = setsEnv ? setsEnv.split(",") : null;
  TestRunner.init(extensionPath);
  TestRunner.start(sets);
}
