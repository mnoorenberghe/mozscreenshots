/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [ "PrivateBrowsing" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Timer.jsm");

this.PrivateBrowsing = {

  init: function(libDir) {},

  configurations: {
    noPB: {
      applyConfig: deferred => {
        let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
        browserWindow.OpenBrowserWindow({private: false});

        // TODO: switch to observer notification
        setTimeout(function waitForWindow() {
          browserWindow.close();
          deferred.resolve();
        }, 100);
      },
    },

    tempPB: {
      applyConfig: deferred => {
        let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
        browserWindow.OpenBrowserWindow({private: true});

        // TODO: switch to observer notification
        setTimeout(function waitToOpenPBWindow() {
          browserWindow.close();
          deferred.resolve();
        }, 100);
      },
    },
  },
};
