/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [ "DevTools" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/devtools/gDevTools.jsm");
Cu.import("resource://gre/modules/Services.jsm");
let { devtools } = Cu.import("resource://gre/modules/devtools/Loader.jsm", {});
let TargetFactory = devtools.TargetFactory;

function getTargetForSelectedTab() {
  let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
  let target = TargetFactory.forTab(browserWindow.gBrowser.selectedTab);
  return target;
}

this.DevTools = {
  init: function(libDir) {
    let panels = ["options", "webconsole", "inspector", "jsdebugger", "styleeditor", "netmonitor"];
    panels.forEach(panel => {
      this.configurations[panel] = {};
      this.configurations[panel].applyConfig = (deferred) => {
        gDevTools.showToolbox(getTargetForSelectedTab(), panel, "bottom").then(() => {
          deferred.resolve(panel);
        });
      }
    });
  },

  configurations: {
    bottomToolbox: {
      applyConfig: (deferred) => {
        gDevTools.showToolbox(getTargetForSelectedTab(), "inspector", "bottom").then(() => {
          deferred.resolve("bottomToolbox");
        });
      },
    },
    sideToolbox: {
      applyConfig: (deferred) => {
        gDevTools.showToolbox(getTargetForSelectedTab(), "inspector", "side").then(() => {
          deferred.resolve("sideToolbox");
        });
      },
    },
    undockedToolbox: {
      applyConfig: (deferred) => {
        gDevTools.showToolbox(getTargetForSelectedTab(), "inspector", "window").then(() => {
          deferred.resolve("undockedToolbox");
        });
      },
    }
  },
};

