# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import datetime
import os

import compare_screenshots
from fetch_screenshots import nightly_revs_for_date, resultset_response_for_push

archive = "/home/mozilla/screenshots/image_archive"
project = "mozilla-central"
base = datetime.date.today()
numdays = 10
resultsets = []
for offset in range(0, numdays):
    d = base - datetime.timedelta(days=offset)
    print d.isoformat()
    nightly_revs = nightly_revs_for_date(project, d.isoformat())
    print nightly_revs

    for rev in nightly_revs:
        resultset_response = resultset_response_for_push(project, rev)
        if not resultset_response:
            continue
        resultset = resultset_response['results'][0]
        print resultset['push_timestamp'], resultset['revision']
        resultsets.append(resultset)

# Sort by push timestamp since a nightly could be triggered on an older revision later (e.g. if the newer revision is busted).
sorted_resultsets = sorted(resultsets, key=lambda resultset: resultset['push_timestamp'])

print
for i, resultset in enumerate(sorted_resultsets):
    if i == 0:
        continue
    oldRev = sorted_resultsets[i - 1]['revision']
    newRev = resultset['revision']
    print i, resultset['push_timestamp'], resultset['revision']
    print "https://screenshots.mattn.ca/compare/?oldProject=%s&oldRev=%s&newProject=%s&newRev=%s" % (project, sorted_resultsets[i - 1]['revision'], project, resultset['revision'])
    compare_screenshots.cli(args=[os.path.join(archive, project, oldRev),
                                  os.path.join(archive, project, newRev),
                                  "--output",
                                  os.path.join(archive, "comparisons", project, oldRev, project, newRev)]
    )
