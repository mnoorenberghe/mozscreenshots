' This Source Code Form is subject to the terms of the Mozilla Public
' License, v. 2.0. If a copy of the MPL was not distributed with this
' file, You can obtain one at http://mozilla.org/MPL/2.0/.

Set oShell = CreateObject("Wscript.Shell")

' Busy-wait until the Display Properties dialog is loaded.
While oShell.AppActivate("Display Properties") = FALSE
    WScript.Sleep 800
Wend

' Loop while Display Properties is open and send the ENTER key until it closes (to apply the theme change).
While oShell.AppActivate("Display Properties") = TRUE
    oShell.AppActivate "Display Properties"
    WScript.Sleep 250
    oShell.SendKeys "{ENTER}"
Wend
