# mozscreenshots

Take screenshots of Mozilla applications in various UI configurations.

The tool will setup the browser in every possible combination of the specified configuration sets (e.g. `WindowSize`) and take a screenshot. Note that the order of the sets affects the order that the configurations are setup. If no sets are specified, the default is: `TabsInTitlebar Tabs WindowSize Toolbars LightweightThemes`.

Note that the extension (XPI) code has mostly moved to https://mxr.mozilla.org/mozilla-central/source/browser/tools/mozscreenshots/mozscreenshots/extension/

[Documentation on MDN](https://developer.mozilla.org/en-US/docs/Mozilla/QA/Browser_screenshots)

# dependencies
* `mozrunner` (mozscreenshots subclasses mozrunner for standalone execution only)
* `compare` and `convert` from ImageMagick for `compare_screenshots`
* `apngasm`(optional) to generate animated PNG comparison images

# capturing screenshots from mozilla source
    mach mochitest --subsuite screenshots
    mach mochitest --subsuite screenshots --setenv MOZSCREENSHOTS_SETS=DevTools
    mach mochitest --subsuite screenshots --setenv MOZSCREENSHOTS_SETS=DevEdition,TabsInTitlebar,Tabs,WindowSize,Toolbars

# capturing screenshots from the standalone executable (not recently tested)
To output the list of valid sets, use `--list-sets`.

## installation
    pip install -U mozscreenshots

## after installation:

    mozscreenshots -b /Applications/Firefox.app/Contents/MacOS/firefox [sets]

## examples

    mozscreenshots -b /Applications/Nightly.app/Contents/MacOS/firefox Tabs WindowSize LightweightThemes
    mozscreenshots -b /c/Program\ Files\ \(x86\)/Mozilla\ Firefox/firefox.exe SystemTheme WindowSize Toolbars
    mozscreenshots -b ~/nightly/firefox Tabs WindowSize Toolbars LightweightThemes

# output
The screenshots can be found in the following directories for now (issue 9 will make them configurable):

* In `MOZ_UPLOAD_DIR` if the environment variables is defined
* `/%TmpD%/mozscreenshots/` (a temporary directory which is output at the before capturing begins)

# caveats
* The `SystemTheme` configuration attempts to change the Windows theme while the application is running which doesn't always work correctly. The alternative is to manually change the Windows theme before a run and not including the `SystemTheme` set.
* On OS X, if you have another instance of the binary running from the same path (e.g. with a different profile), the wrong application may be captured. You can use a symlink to workaround the issue.
* There is no attempt to reset the profile or system theme back to their original value after a run. The Windows theme can be re-set manually and runs shouldn't be performed on a user's default profile.

# fetching images from automation

Use `fetch_screenshots` to fetch screenshots from Mozilla automation (e.g. Try server):

    pip install -U mozscreenshots
    fetch_screenshots -n 2017-01-17
    fetch_screenshots --project mozilla-central -r 3e275d37a06236981bff399b7d7aa0646be3fee7
    fetch_screenshots -r <try_rev>

# comparing images for changes

Use `compare_screenshots` to compare image files or directories (recursively) using ImageMagick. System UI
(e.g. the clock and taskbar) is cropped out of the images when necessary so they aren't included in
image comparisons and generate false positives.

    pip install -U mozscreenshots
    compare_screenshots  mozilla-central/08138045c38c/ try/5f6ca9194dd9/

# web UI

https://screenshots.mattn.ca/compare/
