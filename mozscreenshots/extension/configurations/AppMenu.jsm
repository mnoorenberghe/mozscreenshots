/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [ "AppMenu" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");

this.AppMenu = {

  init: function(libDir) {},

  configurations: [
    function appMenuClosed(deferred) {
      let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      browserWindow.PanelUI.hide();
      deferred.resolve();
    },

    function appMenuMainView(deferred) {
      let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      let promise = browserWindow.PanelUI.show();
      browserWindow.PanelUI.showMainView();
      deferred.resolve(promise);
    },

    function appMenuHistorySubview(deferred) {
      // History has a footer
      let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      if (browserWindow.document.documentElement.hasAttribute("customizing")) {
        deferred.reject("Can't show subviews while customizing");
        return;
      }
      let promise = browserWindow.PanelUI.show();
      promise.then(() => {
        browserWindow.PanelUI.showMainView();
        browserWindow.document.getElementById("history-panelmenu").click();
        // TODO: add a hover effect on an item
        deferred.resolve();
      });
    },

    function appMenuHelpSubview(deferred) {
      let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      if (browserWindow.document.documentElement.hasAttribute("customizing")) {
        deferred.reject("Can't show subviews while customizing");
        return;
      }
      let promise = browserWindow.PanelUI.show();
      promise.then(() => {
        browserWindow.PanelUI.showMainView();
        browserWindow.document.getElementById("PanelUI-help").click();
        // TODO: add a hover effect on an item
        deferred.resolve();
      });
    },

  ],
};
