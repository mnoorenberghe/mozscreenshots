/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [ "AppMenu" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");

this.AppMenu = {

  init: function(libDir) {},

  configurations: {
    appMenuClosed: {
      applyConfig: deferred => {
        let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
        browserWindow.PanelUI.hide();
        deferred.resolve();
      },
    },

    appMenuMainView: {
      applyConfig: deferred => {
        let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
        let promise = browserWindow.PanelUI.show();
        browserWindow.PanelUI.showMainView();
        deferred.resolve(promise);
      },
    },

    appMenuHistorySubview: {
      applyConfig: deferred => {
        // History has a footer
        if (rejectIfCustomizing(deferred)) {
          return;
        }
        let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
        let promise = browserWindow.PanelUI.show();
        promise.then(() => {
          browserWindow.PanelUI.showMainView();
          browserWindow.document.getElementById("history-panelmenu").click();
          // TODO: add a hover effect on an item
          deferred.resolve();
        });
      },

      verifyConfig: verifyConfigHelper,
    },

    appMenuHelpSubview: {
      applyConfig: deferred => {
        if (rejectIfCustomizing(deferred)) {
          return;
        }
        let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
        let promise = browserWindow.PanelUI.show();
        promise.then(() => {
          browserWindow.PanelUI.showMainView();
          browserWindow.document.getElementById("PanelUI-help").click();
          // TODO: add a hover effect on an item
          deferred.resolve();
        });
      },

      verifyConfig: verifyConfigHelper,
    },

  },
};

function verifyConfigHelper(deferred) {
  if (!rejectIfCustomizing(deferred)) {
    deferred.resolve("AppMenu verifyConfigHelper");
  }
}

function rejectIfCustomizing(deferred) {
  let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
  if (browserWindow.document.documentElement.hasAttribute("customizing")) {
    deferred.reject("Can't show subviews while customizing");
    return true;
  }
  return false;
}
