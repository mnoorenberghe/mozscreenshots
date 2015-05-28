# mozscreenshots

Take screenshots of Mozilla applications in various UI configurations.

**Note**: mozscreenshots is not intended to be run on a user's main profile as it sets preferences and changes the application configuration without the possibility to undo this. A clean temporary profile will be created via `mozrunner` by default.

# dependencies
* `mozrunner` (mozscreenshots subclasses mozrunner)
* `compare` and `convert` from ImageMagick for `compare_screenshots`
* `scrot` may be used as a fallback for Linux screenshots

# running mozscreenshots
The tool will setup the browser in every possible combination of the specified configuration sets (e.g. `WindowSize`) and take a screenshot. Note that the order of the sets affects the order that the configurations are setup. If no sets are specified, the default is: `TabsInTitlebar Tabs WindowSize Toolbars LightweightThemes`. To output the list of valid sets, use `--list-sets`.

## running from source:

    python runner.py -b /Applications/Nightly.app/Contents/MacOS/firefox [sets]
You can package mozscreenshots.xpi with the Makefile in the extension directory.

## after installation:

    mozscreenshots -b /Applications/FirefoxUX.app/Contents/MacOS/firefox [sets]

## examples

    mozscreenshots -b /Applications/Nightly.app/Contents/MacOS/firefox Tabs WindowSize LightweightThemes
    mozscreenshots -b /c/Program\ Files\ \(x86\)/Mozilla\ Firefox/firefox.exe SystemTheme WindowSize Toolbars
    mozscreenshots -b ~/nightly/firefox Tabs WindowSize Toolbars LightweightThemes

# output
The screenshots can be found in the following directories for now (issue 9 will make them configurable via the command line):

* In MOZ_UPLOAD_DIR if the environment variables is defined
* `TmpD\mozscreenshots\` or `C:\mozscreenshots\` (Windows)
* `/tmp/mozscreenshots/` (OS X and Linux)

# caveats
* The `SystemTheme` configuration attempts to change the Windows theme while the application is running which doesn't always work correctly. The alternative is to manually change the Windows theme before a run and not including the `SystemTheme` set.
* On OS X, if you have another instance of the binary running from the same path (e.g. with a different profile), the wrong application may be captured. You can use a symlink to workaround the issue.
* There is no attempt to reset the profile or system theme back to their original value after a run. The Windows theme can be re-set manually and runs shouldn't be performed on a user's default profile.

# fetching images from automation

Use `fetch_screenshots` to fetch screenshots from Mozilla automation (e.g. Try server):

    fetch_screenshots -r 9f4d4ce255a1

# comparing images for changes

Use `compare_screenshots` to compare image files or directories using ImageMagick. System UI
(e.g. the clock) can be cropped out of the images when necessary so they aren't included in
image comparisons.

      compare_screenshots --osversion 10.6 08138045c38c-osx-10-6-7844870/ 5f6ca9194dd9-osx-10-6-7844873/
