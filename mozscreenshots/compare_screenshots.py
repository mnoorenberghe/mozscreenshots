# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import print_function

import argparse
import fcntl
import glob
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
from collections import defaultdict, namedtuple

comparisonResultNames = ["SIMILAR", "DIFFERENT", "ERROR", "MISSING_BEFORE", "MISSING_AFTER"]
ComparisonResult = namedtuple("ComparisonResult", comparisonResultNames)._make(range(0, len(comparisonResultNames)))


def remove_prefix(filename):
    return re.sub(r'^((before|after)_)?[^-_]*[-_]', '', filename)


def get_suffixes(path):
    return [remove_prefix(filename)
             for filename in os.listdir(path) if filename.endswith(".png")]


def compare_images(before, after, outdir, similar_dir, args):
    # https://medium.com/@rhuber/imagemagick-is-on-fire-cve-2016-3714-379faf762247#.ftia8t3qs
    if not is_png_file(before) or not is_png_file(after):
        print("No PNG magic number")
        return (ComparisonResult.ERROR, -1)

    output_similar_composite = getattr(args, "output_similar_composite", False)
    before_trimmed = trim_system_ui("before", before, outdir, args)
    after_trimmed = trim_system_ui("after", after, outdir, args)
    before_name_unprefixed = remove_prefix(os.path.basename(before_trimmed))
    after_name_unprefixed = remove_prefix(os.path.basename(after_trimmed))

    outname = None
    # Use the shorter of the two names so the name is the common subset
    if len(after_name_unprefixed) > len(before_name_unprefixed):
        outname = before_name_unprefixed
    else:
        outname = after_name_unprefixed
    outpath = os.path.join(outdir, outname)
    result = 0
    diff = -1
    try:
        diff = subprocess.check_output(["compare", "-quiet", "-fuzz", "3%", "-metric", "AE",
                                        before_trimmed, after_trimmed, "null:"],
                                       stderr=subprocess.STDOUT)
    except OSError:
        print("\n\nEnsure that ImageMagick is installed and on your PATH, specifically `compare`.\n")
        raise
    except subprocess.CalledProcessError as e:
        result = e.returncode
        diff = e.output

    print(diff)

    if result != ComparisonResult.SIMILAR or output_similar_composite:
        subprocess.call(["compare", "-quiet", "-lowlight-color", "rgba(255,255,255,0)",
                         before_trimmed, after_trimmed, outpath])
        try:
            FNULL = open(os.devnull, 'w')
            subprocess.call(["apngasm", "--force", "--delay", "400", outpath,
                             before_trimmed, after_trimmed,
                             "--output", outpath + ".animated"],
                            stdout=FNULL, close_fds=True)
            os.remove(outpath) # For Windows
            os.rename(outpath + ".animated", outpath)
        except OSError:
            # Not a fatal error if the APNG can't be created since we have the
            # compare output already
            pass

    if result == ComparisonResult.SIMILAR:
        if output_similar_composite:
            os.rename(outpath, similar_dir + "/" + outname)
    elif result == ComparisonResult.DIFFERENT:
        pass
    else:
        result = ComparisonResult.ERROR
        print("error")

    # Cleanup intermediate trimmed images
    if os.path.exists(before_trimmed) and os.path.abspath(before) != os.path.abspath(before_trimmed):
        os.remove(before_trimmed)
    if os.path.exists(after_trimmed) and os.path.abspath(after) != os.path.abspath(after_trimmed):
        os.remove(after_trimmed)
    return (result, diff)


def trim_system_ui(prefix, imagefile, outdir, args):
    if "_fullScreen" in imagefile:
        return imagefile
    outpath = os.path.join(outdir, prefix + "_" + os.path.basename(imagefile))

    chop_top = chop_right = chop_bottom = chop_left = 0
    if "osx-10-6-" in imagefile:
        titlebar_height = 22 * args.dppx
        chop_top = titlebar_height
        # Check for maximized since the default is normal (e.g. devtools)
        if "_maximized_" in imagefile:
            chop_right = 0
        else:
            # desktop icons and other windows
            chop_right = 316
            chop_left = 4
        dock_height = 90 * args.dppx # no longer used
        chop_bottom = 110

    elif "windows7-" in imagefile or "windows8-64-" in imagefile or "windowsxp-" in imagefile:
        taskbar_height = (30 if ("windowsxp-" in imagefile) else 40) * args.dppx
        chop_bottom = taskbar_height
        if "_maximized_" not in imagefile:
            if "windows8-64-" in imagefile or "windowsxp-" in imagefile:
                chop_right = 316
                chop_bottom = 156
                chop_top = chop_left = 4
            if "windows7-" in imagefile and "_normal_" in imagefile:
                # We check for _normal_ since the default is maximized for the resolution of the Win7 machines.
                chop_right = 124
                chop_bottom = 135

    elif "linux32-" in imagefile or "linux64-" in imagefile:
        titlebar_height = 24 * args.dppx
        chop_top = titlebar_height
    else:
        return imagefile

    trim_args = ["convert", imagefile,
                 "-gravity", "North", "-chop", "0x%d" % chop_top,
                 "-gravity", "South", "-chop", "0x%d" % chop_bottom,
                 "-gravity", "East", "-chop", "%dx0" % chop_right,
                 "-gravity", "West", "-chop", "%dx0" % chop_left,
                 outpath]

    try:
        subprocess.call(trim_args)
    except OSError:
        print("\n\nEnsure that ImageMagick is installed and on your PATH, specifically `convert`.\n")
        raise

    return outpath

def is_png_file(path):
    f = open(path, "r")
    data = f.read(8)
    f.close()
    return data[:8] == '\x89PNG\x0d\x0a\x1a\x0a'

def compare_dirs(before, after, outdir, args):
    rv = {}
    for before_dirpath, before_dirs, before_files in os.walk(before):
        for before_dir in before_dirs:
            dir_prefix = re.sub(r'-\d{3,}$', '', before_dir)
            matches = glob.glob(os.path.join(after, dir_prefix) + "*")
            if matches and os.path.isdir(matches[-1]):
                rv.update(compare_dirs(os.path.join(before, before_dir), matches[-1],
                                              os.path.join(outdir, dir_prefix), args))

    print('\nComparing {0} and {1} in {2}'.format(before, after, outdir))
    try:
        os.makedirs(outdir)
    except OSError:
        if not os.path.isdir(outdir):
            print('Error creating directory: %s' % outdir)
            return rv

    json_path = os.path.join(outdir, "comparison.json")
    if os.path.isfile(json_path) and not getattr(args, "overwrite", False):
        print("Comparison already completed");
        return rv

    lock_fd = open(os.path.join(outdir, "comparison.lock"), 'w')
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB);
    except IOError:
        print("Comparison already in progress")
        return rv

    similar_dir = os.path.join(outdir, "similar")
    if getattr(args, "output_similar_composite", False):
        os.makedirs(similar_dir)
    sorted_suffixes = sorted(set(get_suffixes(before) + get_suffixes(after)))

    if len(sorted_suffixes) == 0:
        print("No images in the directory")
        return rv

    maxFWidth = reduce(lambda x, y: max(x, len(y)), sorted_suffixes, 0)

    print("SCREENSHOT SUFFIX".ljust(maxFWidth), "DIFFERING PIXELS (WITH FUZZ)")
    result_dict = defaultdict(list)
    file_output_dict = defaultdict(dict)
    for f in sorted_suffixes:
        image1 = glob.glob(before + "/*[-_]" + f)
        image2 = glob.glob(after + "/*[-_]" + f)
        if not image1:
            print("{0} exists in after but not in before".format(f))
            result_dict[ComparisonResult.MISSING_BEFORE].append(f)
            file_output_dict[f]["result"] = ComparisonResult.MISSING_BEFORE
            continue
        if not image2:
            print("{0} exists in before but not in after".format(f))
            result_dict[ComparisonResult.MISSING_AFTER].append(f)
            file_output_dict[f]["result"] = ComparisonResult.MISSING_AFTER
            continue
        print(f, "", end="".ljust(maxFWidth - len(f)))
        result, diff = compare_images(image1[0], image2[0], outdir, similar_dir, args)
        result_dict[result].append(f)
        file_output_dict[f]["result"] = result
        file_output_dict[f]["difference"] = diff
    print("{0} similar, {1} different, {2} missing, {3} errors"
          .format(len(result_dict[ComparisonResult.SIMILAR]),
                  len(result_dict[ComparisonResult.DIFFERENT]),
                  len(result_dict[ComparisonResult.MISSING_BEFORE])
                  + len(result_dict[ComparisonResult.MISSING_AFTER]),
                  len(result_dict[ComparisonResult.ERROR])))

    json_file = open(json_path, 'w')
    json.dump(file_output_dict, json_file, allow_nan=False, sort_keys=True)
    json_file.close()

    fcntl.flock(lock_fd, fcntl.LOCK_UN);

    rv[outdir] = file_output_dict;
    return rv


def cli(args=sys.argv[1:]):
    parser = argparse.ArgumentParser(description='Compare screenshot files or directories for differences')
    parser.add_argument("before", help="Image file or directory of images")
    parser.add_argument("after", help="Image file or directory of images")
    parser.add_argument("--dppx", type=float, default=1.0, help="Scale factor to use for cropping system UI")
    parser.add_argument("-o", "--output", default=None, metavar="DIRECTORY", help="Directory to output JSON and composite images to")
    parser.add_argument("--output-similar-composite", action="store_true", help="Output a composite image even when images are 'similar'")
    parser.add_argument("--overwrite", action="store_true", default=False, help="Whether to overwrite an existing directory comparison")

    args = parser.parse_args(args)

    before = args.before
    after = args.after
    if args.output:
        outdir = args.output
        try:
            os.makedirs(outdir)
        except OSError:
            if not os.path.isdir(outdir):
                print('Error creating directory: %s' % outdir)
                sys.exit(1)
    else:
        outdir = tempfile.mkdtemp()

    if (os.path.isdir(before) and os.path.isdir(after)):
        compare_dirs(before, after, outdir, args)
    elif (os.path.isfile(before) and os.path.isfile(after)):
        print()
        compare_images(before, after, outdir, outdir, args)
    else:
        print("Two files or two directories expected")
        return

    print("Image comparison results:", outdir)

if __name__ == "__main__":
    cli()
