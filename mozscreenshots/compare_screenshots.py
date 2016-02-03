# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import print_function

import argparse
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


def compare_images(before, after, outdir, similar_dir, args):
    before = trim_system_ui("before", before, outdir, args)
    after = trim_system_ui("after", after, outdir, args)
    outname = "comparison_" + os.path.basename(before)
    outpath = outdir + "/" + outname
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


def trim_system_ui(prefix, imagefile, outdir, args):
    if "_fullScreen" in imagefile:
        return imagefile
    outpath = imagefile

    if "osx-10-6-" in imagefile:
        titlebarHeight = 22 * args.dppx
        chop = "0x%d" % titlebarHeight
        outpath = outdir + "/chop_" + prefix + "_" + os.path.basename(imagefile)
        subprocess.call(["convert", imagefile, "-chop", chop, outpath])
    elif "windows7-" in imagefile or "windows8-64-" in imagefile or "windowsxp-" in imagefile:
        taskbarHeight = (30 if ("windowsxp-" in imagefile) else 40) * args.dppx
        chop = "0x%d" % taskbarHeight
        outpath = outdir + "/chop_" + prefix + "_" + os.path.basename(imagefile)
        subprocess.call(["convert", imagefile, "-gravity", "South", "-chop", chop, outpath])
    elif "linux32-" in imagefile or "linux64-" in imagefile:
        titlebarHeight = 24 * args.dppx
        chop = "0x%d" % titlebarHeight
        outpath = outdir + "/chop_" + prefix + "_" + os.path.basename(imagefile)
        subprocess.call(["convert", imagefile, "-chop", chop, outpath])

    return outpath


def compare_dirs(before, after, outdir, args):
    similar_dir = outdir + "/similar"
    os.mkdir(similar_dir)
    sorted_suffixes = sorted(set(get_suffixes(before) + get_suffixes(after)))
    maxFWidth = reduce(lambda x, y: max(x, len(y)), sorted_suffixes, 0)

    print("SCREENSHOT SUFFIX".ljust(maxFWidth), "DIFFERING PIXELS (WITH FUZZ)")
    resultDict = defaultdict(list)
    for f in sorted_suffixes:
        image1 = glob.glob(before + "/*" + f)
        image2 = glob.glob(after + "/*" + f)
        if not image1:
            print("{0} exists in after but not in before".format(f))
            resultDict[2].append(f)
            continue
        if not image2:
            print("{0} exists in before but not in after".format(f))
            resultDict[2].append(f)
            continue
        print(f, "", end="".ljust(maxFWidth - len(f)))
        sys.stdout.flush()
        result = compare_images(image1[0], image2[0], outdir, similar_dir, args)
        resultDict[result].append(f)
    print("{0} similar, {1} different, {2} errors".format(len(resultDict[0]), len(resultDict[1]), len(resultDict[2])))

def cli(args=sys.argv[1:]):
    parser = argparse.ArgumentParser(description='Compare screenshot files or directories for differences')
    parser.add_argument("before", help="Image file or directory of images")
    parser.add_argument("after", help="Image file or directory of images")
    parser.add_argument("--dppx", type=float, default=1.0, help="Scale factor to use for cropping system UI")

    args = parser.parse_args()

    before = args.before
    after = args.after
    outdir = tempfile.mkdtemp()
    print("Image comparison results:", outdir)
    print()

    if (os.path.isdir(before) and os.path.isdir(after)):
        compare_dirs(before, after, outdir, args)
    elif (os.path.isfile(before) and os.path.isfile(after)):
        compare_images(before, after, outdir, outdir, args)
    else:
        print("Two files or two directories expected")
        return

if __name__ == "__main__":
    cli()
