/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [ "LightweightThemes" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/LightweightThemeManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Timer.jsm");

this.LightweightThemes = {
  init: function(libDir) {},

  configurations: [
    function noLWT(deferred) {
      LightweightThemeManager.currentTheme = null;
      deferred.resolve();
    },
    function darkLWT(deferred) {
      LightweightThemeManager.currentTheme = {
        id:          "black",
        name:        "black",
        headerURL:   "https://addons.mozilla.org/_files/15433/BlackH.jpg?1236722683",
        footerURL:   "https://addons.mozilla.org/_files/15433/BlackF.jpg?1236722683",
        textcolor:   "#ffffff",
        accentcolor: "#000000",
      };

      // Wait for LWT listener
      setTimeout(() => {
        let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
        if (browserWindow.document.documentElement.hasAttribute("lwtheme")) {
          deferred.resolve();
        } else {
          deferred.reject("The @lwtheme attribute wasn't present so themes may not be available");
        }
      }, 500);
    },
    function lightLWT(deferred) {
      LightweightThemeManager.currentTheme = {
        id:          "white",
        name:        "white",
        headerURL:   "https://addons.mozilla.org/_files/308262/white-header.png?1303118483",
        footerURL:   "https://addons.mozilla.org/_files/308262/white-footer.png?1303118483",
        textcolor:   "#000000",
        accentcolor: "#ffffff",
      };
      // Wait for LWT listener
      setTimeout(() => {
        let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
        if (browserWindow.document.documentElement.hasAttribute("lwtheme")) {
          deferred.resolve();
        } else {
          deferred.reject("The @lwtheme attribute wasn't present so themes may not be available");
        }
      }, 500);
    },
  ],
};
