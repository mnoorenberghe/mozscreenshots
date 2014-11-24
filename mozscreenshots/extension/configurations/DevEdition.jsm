/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [ "DevEdition" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/devtools/Console.jsm");

this.DevEdition = {
  init: function(libDir) {},

  configurations: {
    devEditionLight: {
      applyConfig: (deferred) => {
        Services.prefs.setCharPref("devtools.theme", "light");
        Services.prefs.setBoolPref("browser.devedition.theme.enabled", true);
        Services.prefs.setBoolPref("browser.devedition.theme.showCustomizeButton", true);
        deferred.resolve("devEditionLight");
      }
    },
    devEditionDark: {
      applyConfig: (deferred) => {
        Services.prefs.setCharPref("devtools.theme", "dark");
        Services.prefs.setBoolPref("browser.devedition.theme.enabled", true);
        Services.prefs.setBoolPref("browser.devedition.theme.showCustomizeButton", true);
        deferred.resolve("devEditionDark");
      }
    },
    devEditionOff: {
      applyConfig: (deferred) => {
        Services.prefs.clearUserPref("devtools.theme");
        Services.prefs.clearUserPref("browser.devedition.theme.enabled");
        Services.prefs.clearUserPref("browser.devedition.theme.showCustomizeButton");
        deferred.resolve("devEditionOff");
      }
    },
  },
};
