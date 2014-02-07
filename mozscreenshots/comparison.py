from __future__ import print_function

import glob
import os
import platform
import re
import subprocess
import sys
import tempfile

def get_suffixes(path):
    return [re.sub(r'^[^_]*_', '_', filename)
             for (dirpath, dirs, files) in os.walk(path)
             for filename in (files)]


def compare_images(before, after):
    before = trim_system_ui("before", before)
    after = trim_system_ui("after", after)
    outpath = tempdir + "/comparison_" + os.path.basename(before) + "-" + os.path.basename(after)
    subprocess.call(["compare", before, after, outpath])
    subprocess.call(["compare", "-metric", "MAE", before, after, "null:"])
    print()


def trim_system_ui(prefix, imagefile):
    if "_fullScreen" in imagefile:
        return imagefile
    outpath = imagefile

    if platform.system() == "Darwin":
        titlebarHeight = 44
        try:
            import AppKit
            titlebarHeight *= AppKit.NSScreen.mainScreen().backingScaleFactor()
        except ImportError:
            sys.stderr.write("Could not detect the DPI using AppKit")
        chop = "0x%d" % titlebarHeight
        outpath = tempdir + "/chop_" + prefix + "_" + os.path.basename(imagefile)
        subprocess.call(["convert", imagefile, "-chop", chop, outpath])

    return outpath


def compare_dirs(before, after):
    for f in set(get_suffixes(before) + get_suffixes(after)):
        image1 = glob.glob(sys.argv[1] + "/*" + f)
        image2 = glob.glob(sys.argv[2] + "/*" + f)
        if not image1:
            print("{0} exists in after but not in before".format(f))
            continue
        if not image2:
            print("{0} exists in before but not in after".format(f))
            continue
        print(f, end='\t')
        sys.stdout.flush()
        compare_images(image1[0], image2[0])

if len(sys.argv) < 3:
    print("Two files or two directories expected")
    quit()

before = sys.argv[1]
after = sys.argv[2]

tempdir = tempfile.mkdtemp()
print(tempdir)

if (os.path.isdir(before) and os.path.isdir(after)):
    compare_dirs(before, after)
elif (os.path.isfile(before) and os.path.isfile(after)):
    compare_images(before, after)
else:
    print("Two files or two directories expected")
    quit()
