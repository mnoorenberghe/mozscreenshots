from __future__ import print_function

import glob
import os
import platform
import re
import subprocess
import sys
import tempfile
from collections import defaultdict

def get_suffixes(path):
    return [re.sub(r'^[^_]*_', '_', filename)
             for (dirpath, dirs, files) in os.walk(path)
             for filename in (files)]


def compare_images(before, after, similar_dir):
    before = trim_system_ui("before", before)
    after = trim_system_ui("after", after)
    outname = "comparison_" + os.path.basename(before)
    outpath = tempdir + "/" + outname
    subprocess.call(["compare", "-quiet", before, after, outpath])
    result = subprocess.call(["compare", "-quiet", "-fuzz", "3%", "-metric", "AE", before, after, "null:"], stderr=subprocess.STDOUT)
    print("\t", end="")
    if result == 0: # same
        print()
        os.rename(outpath, similar_dir + "/" + outname)
    elif result == 1: # different
        print()
    else:
        print("error")

    return result


def trim_system_ui(prefix, imagefile):
    if "_fullScreen" in imagefile:
        return imagefile
    outpath = imagefile

    if False and platform.system() == "Darwin": # TODO: not necessary when using the new window capture on OS X
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
    similar_dir = tempdir + "/similar"
    os.mkdir(similar_dir)
    sorted_suffixes = sorted(set(get_suffixes(before) + get_suffixes(after)))
    maxFWidth = reduce(lambda x, y: max(x, len(y)), sorted_suffixes, 0)

    print("SCREENSHOT SUFFIX".ljust(maxFWidth), "DIFFERING PIXELS (WITH FUZZ)")
    resultDict = defaultdict(list)
    for f in sorted_suffixes:
        image1 = glob.glob(sys.argv[1] + "/*" + f)
        image2 = glob.glob(sys.argv[2] + "/*" + f)
        if not image1:
            print("{0} exists in after but not in before".format(f))
            continue
        if not image2:
            print("{0} exists in before but not in after".format(f))
            continue
        print(f, "", end="".ljust(maxFWidth - len(f)))
        sys.stdout.flush()
        result = compare_images(image1[0], image2[0], similar_dir)
        resultDict[result].append(f)
    print("{0} similar, {1} different, {2} errors".format(len(resultDict[0]), len(resultDict[1]), len(resultDict[2])))

if len(sys.argv) < 3:
    print("Two files or two directories expected")
    quit()

before = sys.argv[1]
after = sys.argv[2]

tempdir = tempfile.mkdtemp()
print("Image comparison results:", tempdir)
print()

if (os.path.isdir(before) and os.path.isdir(after)):
    compare_dirs(before, after)
elif (os.path.isfile(before) and os.path.isfile(after)):
    compare_images(before, after)
else:
    print("Two files or two directories expected")
    quit()
