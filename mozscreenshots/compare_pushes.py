# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import datetime
import json
import os
import re
import sys
import time
from collections import namedtuple
from pytz import timezone

import compare_screenshots
from compare_screenshots import ComparisonResult, comparisonResultNames
from fetch_screenshots import resultsets_for_date

archive = os.getcwd()
compare_url_format = "https://screenshots.mattn.ca/compare/?oldProject=%s&oldRev=%s&newProject=%s&newRev=%s"
project = "mozilla-central"
END_DAY = datetime.date.today()
numdays = 7
# Wait a minimum number of hours to reduce sending partial emails for
# in-progress pushes (e.g. linux one email and win in another).
MIN_TIME_SINCE_PUSH = datetime.timedelta(hours=3)
timezone = timezone('US/Pacific')

resultsets = []
resultset_ids = set()


def email_results(project, oldResultset, newResultset, comparison, known_inconsistencies):
    import bleach
    import email
    import re
    import smtplib

    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    oldRev = oldResultset['revision']
    newRev = newResultset['revision']

    # Used to only send an email with at least one difference.
    difference_found = False

    body =  "Project:       {}\n".format(project)
    body += "Base revision: {} ({})\n".format(oldRev, datetime.datetime.fromtimestamp(oldResultset['push_timestamp'], timezone))
    body += "New revision:  {} ({})\n".format(newRev, datetime.datetime.fromtimestamp(newResultset['push_timestamp'], timezone))
    body += "Details:       "
    body += compare_url_format % (project, oldRev, project, newRev) + "\n"
    body += "Pushlog:       "
    body += "https://hg.mozilla.org/{}/pushloghtml?fromchange={}&tochange={}\n\n".format(project, oldRev, newRev)

    for dir, results in comparison.iteritems():
        platform = os.path.basename(dir)

        nonsimilar = dict((key.replace(".png", ""), value) for key, value in results.iteritems()
                          if value["result"] != ComparisonResult.SIMILAR)

        rows = []
        for imagename in sorted(nonsimilar.keys()):
            result = nonsimilar[imagename]
            label = comparisonResultNames[result["result"]]

            if result["result"] == ComparisonResult.DIFFERENT:
                if matches_inconsistency(known_inconsistencies, platform, imagename, result):
#                    print "ignoring", imagename, "on", platform, "with", result['difference']
                    continue

                rows.append((imagename, label, result["difference"]))
            else:
                rows.append((imagename, label))

        if len(rows) > 0:
            difference_found = True
        else:
            continue

        imagenamecolumnwidth = max(30, reduce(lambda x, y: max(x, len(y[0])), rows, 0))
        body += "== " + platform + " ==\n"
        for row in rows:
            body += "{}  {}".format(row[0].ljust(imagenamecolumnwidth), row[1])
            if (len(row) == 3):
                body += " ({})".format(row[2])
            body += "\n"
        body += "\n\n"

    if not difference_found:
        print "\nNo differences found\n\n"
        return

    print "====\n"
    print body

    msg = MIMEMultipart('alternative')
    #msg['Date'] = email.utils.formatdate(float(newResultset['push_timestamp']))
    msg['Message-ID'] = re.sub("@[^>]+>", "@screenshots.mattn.ca>", email.utils.make_msgid())
    msg['Subject'] = '{} Screenshot Changes: {} to {}'.format(project, oldRev[:12], newRev[:12])
    msg['From'] = 'Screenshot Changes <screenshot-changes@screenshots.mattn.ca>'
    msg['To'] = 'dev-ui-alerts@lists.mozilla.org'

    msg.attach(MIMEText(body, 'plain'))
    msg.attach(MIMEText('<pre>\n' + bleach.linkify(body) + '</pre>', 'html'))

    s = smtplib.SMTP('localhost', None, 'screenshots.mattn.ca')
    s.sendmail(msg['From'], [msg['To']], msg.as_string())
    s.quit()
    # Delay before the next email so they get received in the correct order
    time.sleep(20)


def matches_inconsistency(inconsistencies, platform, basename, result):
    for known in inconsistencies:
        if not known['platformRegex'].search(platform):
            continue

        if not known['pixelRegex'].search(str(result['difference'])):
            continue

        if not any(pattern.search(basename) for pattern in known['nameRegexes']):
            continue
        return True

    return False


# Load the known inconsistencies file
known_inconsistencies_path = os.path.join(os.path.dirname(__file__), "..", "web", "known_inconsistencies.json")
with open(known_inconsistencies_path, 'r') as ki_file:
    known_inconsistencies = json.load(ki_file)
    print "Known inconsistencies:", known_inconsistencies
    for known in known_inconsistencies:
        known['platformRegex'] = re.compile(known['platformRegex'])
        known['pixelRegex'] = re.compile(known['pixelRegex'])
        known['nameRegexes'] = map(lambda pattern: re.compile(pattern), known['nameRegexes'])

for offset in range(0, numdays):
    d = END_DAY - datetime.timedelta(days=offset)
    print d.isoformat()
    date_resultsets = resultsets_for_date(project, d.isoformat())
    for r in date_resultsets:
        if r['id'] in resultset_ids:
            continue
        if datetime.datetime.fromtimestamp(r['push_timestamp'], timezone) > datetime.datetime.now(timezone) - MIN_TIME_SINCE_PUSH:
            # Give more time for the jobs to complete.
            continue
        resultset_ids.add(r['id'])
        resultsets.append(r)

    print resultset_ids, len(resultset_ids), len(resultsets)

# Sort by push timestamp since a nightly could be triggered on an older revision
# later (e.g. if the newer revision is busted).
sorted_resultsets = sorted(resultsets, key=lambda resultset: resultset['push_timestamp'])

print
for i, resultset in enumerate(sorted_resultsets):
    if i == 0:
        continue
    oldResultset = sorted_resultsets[i - 1]
    oldRev = oldResultset['revision']
    newRev = resultset['revision']
    print i, resultset['id'], resultset['push_timestamp'], datetime.datetime.fromtimestamp(resultset['push_timestamp'], timezone), resultset['revision']
    print compare_url_format % (project, oldRev, project, newRev)

    outdir = os.path.join(archive, "comparisons", project, oldRev, project, newRev)
    try:
        os.makedirs(outdir)
    except OSError:
        if not os.path.isdir(outdir):
            print('Error creating directory: %s' % outdir)
            sys.exit(1)

    CompareDirOptions = namedtuple('CompareDirOptions', 'dppx overwrite include_completed')
    options = CompareDirOptions(dppx=1.0, overwrite=False, include_completed=False)

    comparison = compare_screenshots.compare_dirs(os.path.join(archive, project, oldRev),
                                                  os.path.join(archive, project, newRev),
                                                  outdir, options)
    lastRev = newRev

    email_results(project, oldResultset, resultset, comparison, known_inconsistencies)
