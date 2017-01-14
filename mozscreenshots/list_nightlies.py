# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import datetime
import os
import sys
from collections import namedtuple

import compare_screenshots
from compare_screenshots import ComparisonResult, comparisonResultNames
from fetch_screenshots import nightly_revs_for_date, resultset_response_for_push

archive = os.getcwd()
compare_url_format = "https://screenshots.mattn.ca/compare/?oldProject=%s&oldRev=%s&newProject=%s&newRev=%s"
project = "mozilla-central"
base = datetime.date.today()
numdays = 4
resultsets = []
nightly_revs = set()


def email_results(project, oldRev, newRev, comparison):
    import email
    import json
    import re
    import smtplib

    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    # Used to only send an email with at least one difference.
    difference_found = False
    body = "Screenshot changes between {} revisions {} and {}\n".format(project,
                                                                        oldRev[:12],
                                                                        newRev[:12])
    body += compare_url_format % (project, oldRev, project, newRev) + "\n\n"

    for dir, results in comparison.iteritems():
        differences = ""

        nonsimilar = dict((key.replace(".png", ""), value) for key, value in results.iteritems()
                          if value["result"] != ComparisonResult.SIMILAR)
        imagenamecolumnwidth = reduce(lambda x, y: max(x, len(y)), nonsimilar.keys(), 0)

        for imagename in sorted(nonsimilar.keys()):
            result = nonsimilar[imagename]
            label = comparisonResultNames[result["result"]]

            if result["result"] == ComparisonResult.DIFFERENT:
                differences += "{} {} ({})\n".format(imagename.ljust(imagenamecolumnwidth),
                                                     label,
                                                     result["difference"])
            else:
                differences += "{} {}\n".format(imagename.ljust(imagenamecolumnwidth), label)

        if differences:
            difference_found = True
        else:
            continue
        body += "== " + os.path.basename(dir) + " ==\n"
        body += differences
        body += "\n\n"

    if not difference_found:
        return

    msg = MIMEMultipart('alternative')
    msg['Message-ID'] = re.sub("@[^>]+>", "@screenshots.mattn.ca>", email.utils.make_msgid())
    msg['Subject'] = 'Nightly Screenshot Changes: {} to {}'.format(oldRev[:12], newRev[:12])
    msg['From'] = 'Nightly Screenshot Changes <nightly-changes@screenshots.mattn.ca>'
    msg['To'] = 'dev-ui-alerts@lists.mozilla.org'

    msg.attach(MIMEText(body, 'plain'))
    msg.attach(MIMEText('<pre>' + body + '</pre>', 'html'))

    s = smtplib.SMTP('localhost', None, 'screenshots.mattn.ca')
    s.sendmail(msg['From'], [msg['To']], msg.as_string())
    s.quit()

for offset in range(0, numdays):
    d = base - datetime.timedelta(days=offset)
    print d.isoformat()
    revs = nightly_revs_for_date(project, d.isoformat())
    print revs
    nightly_revs.update(revs)

for rev in nightly_revs:
    resultset_response = resultset_response_for_push(project, rev)
    if not resultset_response:
        continue
    resultset = resultset_response['results'][0]
    print resultset['push_timestamp'], resultset['revision']
    resultsets.append(resultset)

# Sort by push timestamp since a nightly could be triggered on an older revision
# later (e.g. if the newer revision is busted).
sorted_resultsets = sorted(resultsets, key=lambda resultset: resultset['push_timestamp'])

print
for i, resultset in enumerate(sorted_resultsets):
    if i == 0:
        continue
    oldRev = sorted_resultsets[i - 1]['revision']
    newRev = resultset['revision']
    print i, resultset['push_timestamp'], resultset['revision']
    print compare_url_format % (project, oldRev, project, newRev)

    outdir = os.path.join(archive, "comparisons", project, oldRev, project, newRev)
    try:
        os.makedirs(outdir)
    except OSError:
        if not os.path.isdir(outdir):
            print('Error creating directory: %s' % outdir)
            sys.exit(1)

    CompareDirOptions = namedtuple('CompareDirOptions', 'dppx overwrite')
    options = CompareDirOptions(dppx=1.0, overwrite=False)

    comparison = compare_screenshots.compare_dirs(os.path.join(archive, project, oldRev),
                                                  os.path.join(archive, project, newRev),
                                                  outdir, options)
    email_results(project, oldRev, newRev, comparison)
