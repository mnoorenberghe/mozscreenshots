/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [ "WindowSize" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Timer.jsm");

this.WindowSize = {

  init: function(libDir) {
    Services.prefs.setBoolPref("browser.fullscreen.autohide", false);
  },

  configurations: [
    function maximized(deferred) {
      let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      browserWindow.fullScreen = false;

      // Wait for the Lion fullscreen transition to end as there doesn't seem to be an event
      // and trying to maximize while still leaving fullscreen doesn't work.
      setTimeout(function waitToLeaveFS() {
        browserWindow.maximize();
        deferred.resolve();
      }, Services.appinfo.OS == "Darwin" ? 1500 : 0);
    },
    function normal(deferred) {
      let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      browserWindow.fullScreen = false;
      browserWindow.restore();
      deferred.resolve();
    },
    function fullScreen(deferred) {
      let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      browserWindow.fullScreen = true;
      // OS X Lion fullscreen transition takes a while
      setTimeout(function waitAfterEnteringFS() {
        deferred.resolve();
      }, Services.appinfo.OS == "Darwin" ? 1500 : 0);
    }
  ],
};
