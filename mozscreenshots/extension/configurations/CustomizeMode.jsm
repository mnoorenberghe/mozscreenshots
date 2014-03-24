/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [ "CustomizeMode" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");

this.CustomizeMode = {

  init: function(libDir) {},

  configurations: [
    function notCustomizing(deferred) {
      let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      if (!browserWindow.document.documentElement.hasAttribute("customizing")) {
        deferred.resolve();
        return;
      }
      function onCustomizationEnds() {
        browserWindow.gNavToolbox.removeEventListener("aftercustomization", onCustomizationEnds);
        deferred.resolve();
      }
      browserWindow.gNavToolbox.addEventListener("aftercustomization", onCustomizationEnds);
      browserWindow.gCustomizeMode.exit();
    },
    function customizing(deferred) {
      let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      if (browserWindow.document.documentElement.hasAttribute("customizing")) {
        deferred.resolve();
        return;
      }
      function onCustomizing() {
        browserWindow.gNavToolbox.removeEventListener("customizationready", onCustomizing);
        deferred.resolve();
      }
      browserWindow.gNavToolbox.addEventListener("customizationready", onCustomizing);
      browserWindow.gCustomizeMode.enter();
    }
  ],
};
