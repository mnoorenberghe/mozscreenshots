/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [ "SystemTheme" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/Timer.jsm");
Cu.import("resource://gre/modules/devtools/Console.jsm");

let SystemTheme = {
  _libDir: null,
  configurations: {},

  init: function(libDir) {
    this._libDir = libDir;

    if (Services.appinfo.OS === "WINNT") {
      let env = Cc["@mozilla.org/process/environment;1"]
                  .getService(Ci.nsIEnvironment);
      let resourcesDir = env.get("SystemRoot") + "\\Resources";
      let winVersion = getWindowsVersion();

      if (winVersion.majorVersion == 6) { // Windows Vista, 7 and 8
        this.configurations = {
          aeroGlass: {
            applyConfig: deferred => {
              SystemTheme._changeWindowsTheme(resourcesDir + "\\Themes\\aero.theme",
                                              deferred);
            },
          },
          aeroBasic: {
            applyConfig: deferred => {
              SystemTheme._changeWindowsTheme(resourcesDir + "\\Ease of Access Themes\\basic.theme",
                                              deferred);
            },
          },
          classic: {
            applyConfig: deferred => {
              SystemTheme._changeWindowsTheme(resourcesDir + "\\Ease of Access Themes\\classic.theme",
                                              deferred);
            },
          },
          HighContrast1: {
            applyConfig: deferred => {
              SystemTheme._changeWindowsTheme(resourcesDir + "\\Ease of Access Themes\\hc1.theme",
                                              deferred);
            },
          },
        };
      } else if (winVersion.majorVersion == 5) { // Windows XP
        this.configurations = {
          luna: {
            applyConfig: deferred => {
              SystemTheme._changeWindowsXPTheme(resourcesDir + "\\Themes\\Luna.theme", deferred);
            },
          },
          classic: {
            applyConfig: deferred => {
              SystemTheme._changeWindowsXPTheme(resourcesDir + "\\Themes\\Windows Classic.theme", deferred);
            },
          },
        };
      }
    } else {
      this.configurations = {
        defaultTheme: {
          applyConfig: deferred => {
            deferred.resolve();
            // Do nothing. This is here so the default set works on all OSs.
          },
        },
      };
    }
  },


  // helpers //

  _changeWindowsTheme: function(themeFilePath, deferred) {
    let changeWindowsThemeBat = this._libDir.clone();
    changeWindowsThemeBat.append("ChangeWindowsTheme.bat");
    let process = Cc["@mozilla.org/process/util;1"]
                    .createInstance(Ci.nsIProcess);
    process.init(changeWindowsThemeBat);

    // Run the process.
    let args = [themeFilePath];
    process.runAsync(args, args.length, function themeChangeComplete() {
      // Focus the browser again (instead of the theme selector)
      setTimeout(this._closeWindowsPersonalizationWindow, 1000);

      setTimeout(function focusTab() {
        let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
        browserWindow.gBrowser.selectedBrowser.focus();
        // TODO: poll registry for theme value to know when ready? or does it get set right away while the modal is up?
        deferred.resolve();
      }, 5000);
    }.bind(this));
  },

  _changeWindowsXPTheme: function(themeFilePath, deferred) {
    let XPTheme = this._libDir.clone();
    XPTheme.initWithPath(themeFilePath);
    let process = Cc["@mozilla.org/process/util;1"]
                    .createInstance(Ci.nsIProcess);
    process.init(XPTheme);

    // Run the process.
    let args = [];
    process.runAsync(args, args.length, function themeChangeComplete() {
      // TODO: doing nothing because this only returns upon close? If so, we should use this instead of setTimeout?
      let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      // Focus the browser again (instead of the theme selector)
      browserWindow.gBrowser.selectedBrowser.focus();
      // Give the window controls and titlebar time to repaint.
      setTimeout(deferred.resolve, 500);
    });

    let CloseDisplayProps = this._libDir.clone();
    CloseDisplayProps.append("CloseDisplayProperties.vbs");
    let closeProcess = Cc["@mozilla.org/process/util;1"]
                         .createInstance(Ci.nsIProcess);
    closeProcess.init(CloseDisplayProps);

    setTimeout(function closeThemeSelector() {
      closeProcess.runAsync(args, args.length, function themeSelectorClosed() {
        // TODO: should we be doing something here?
      });
    }, 1500);
  },

  _closeWindowsPersonalizationWindow: function () {
    try {
      let lib = ctypes.open("user32.dll");

      let findWindowFunc = lib.declare("FindWindowW", ctypes.winapi_abi, ctypes.int32_t, ctypes.jschar.ptr, ctypes.jschar.ptr);
      // Get the Personalization window
      let hWnd = findWindowFunc('CabinetWClass', 'Personalization');
      if (!hWnd) {
        console.error("Cannot find the Personalization window");
        return;
      }

      // Post the close event to the window
      let postMessageFunc = lib.declare("PostMessageW", ctypes.winapi_abi, ctypes.bool, ctypes.int32_t, ctypes.uint32_t, ctypes.size_t, ctypes.size_t);
      const WM_CLOSE = 16;
      postMessageFunc(hWnd, WM_CLOSE, 0, 0);

      lib.close();
    } catch (ex) {
      console.error(ex);
    }
  },

};


// helpers


/**
 * Based on getServicePack from toolkit/mozapps/update/test/unit/test_0040_general.js
 */
function getWindowsVersion() {
  if (Services.appinfo.OS !== "WINNT")
    throw ("getWindowsVersion called on non-Windows operating system");

  const BYTE = ctypes.uint8_t;
  const WORD = ctypes.uint16_t;
  const DWORD = ctypes.uint32_t;
  const WCHAR = ctypes.jschar;
  const BOOL = ctypes.int;

  // This structure is described at:
  // http://msdn.microsoft.com/en-us/library/ms724833%28v=vs.85%29.aspx
  const SZCSDVERSIONLENGTH = 128;
  const OSVERSIONINFOEXW = new ctypes.StructType('OSVERSIONINFOEXW',
                                                 [
                                                   {dwOSVersionInfoSize: DWORD},
                                                   {dwMajorVersion: DWORD},
                                                   {dwMinorVersion: DWORD},
                                                   {dwBuildNumber: DWORD},
                                                   {dwPlatformId: DWORD},
                                                   {szCSDVersion: ctypes.ArrayType(WCHAR, SZCSDVERSIONLENGTH)},
                                                   {wServicePackMajor: WORD},
                                                   {wServicePackMinor: WORD},
                                                   {wSuiteMask: WORD},
                                                   {wProductType: BYTE},
                                                   {wReserved: BYTE}
                                                 ]);

  let kernel32 = ctypes.open("kernel32");
  try {
    let GetVersionEx = kernel32.declare("GetVersionExW",
                                        ctypes.default_abi,
                                        BOOL,
                                        OSVERSIONINFOEXW.ptr);
    let winVer = OSVERSIONINFOEXW();
    winVer.dwOSVersionInfoSize = OSVERSIONINFOEXW.size;

    if (0 === GetVersionEx(winVer.address())) {
      throw("Failure in GetVersionEx (returned 0)");
    }

    let versionInfo = {
      majorVersion: winVer.dwMajorVersion,
      minorVersion: winVer.dwMinorVersion,
      servicePackMajor: winVer.wServicePackMajor,
      servicePackMinor: winVer.wServicePackMinor,
    };

    return versionInfo;
  } finally {
    kernel32.close();
  }
}
