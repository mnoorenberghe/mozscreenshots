# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import json
import os
import os.path
import requests

def fetch_screenshots(rev, project, job_type_name):
    resultset_url = 'https://treeherder.mozilla.org/api/project/%s/resultset/?count=1&full=true&revision=%s' % (project, rev)
    resultset = requests.get(resultset_url).json()

    if resultset['meta']['count'] == 0:
        print 'No results for that revision'
        return

    result_set_id = resultset['results'][0]['id']
    fetch_screenshots_for_result_set_id(rev, project, job_type_name, result_set_id)

def fetch_screenshots_for_result_set_id(rev, project, job_type_name, result_set_id):
    print "Result Set ID: %d" % result_set_id

    jobs_url = 'https://treeherder.mozilla.org/api/project/%s/jobs/?count=2000&result_set_id=%d' % (project, result_set_id)
    jobs = requests.get(jobs_url).json()

    for job in jobs['results']:
        if job['job_type_name'] != job_type_name:
            continue
        job_id = job['id']
        fetch_artifacts_for_job(job_id, job['platform'], rev, project)


def fetch_artifacts_for_job(job_id, platform, rev, project):
    print "Fetching artifacts for job id: %d" % job_id
    artifacts_url = 'https://treeherder.mozilla.org/api/project/%s/artifact/?job_id=%d&name=Job+Info&type=json' % (project, job_id)
    artifacts = requests.get(artifacts_url).json()

    for artifact in artifacts:
        if "blob" not in artifact:
            continue

        blob = artifact["blob"]

        if "job_details" not in blob:
            continue

        job_details = blob["job_details"]

        for detail in job_details:
            if not detail["value"].endswith(".png"):
                continue
            try:
                os.mkdir("%s-%s-%d" % (rev, platform, job_id))
            except OSError:
                pass

            download_screenshot(detail["url"], "%s-%s-%d/%s" % (rev, platform, job_id, detail["value"]))


def download_screenshot(url, filepath):
    print "Downloading %s" % filepath,
    if os.path.isfile(filepath):
        print "- Not overwriting existing file"
        return
    else:
        print
    image = requests.get(url)
    file = open(filepath, 'wb')
    file.write(image.content)
    file.close()

def cli():
    parser = argparse.ArgumentParser(description='Fetch screenshots from automation')
    parser.add_argument('-r', '--rev', required=True,
                        help="Revision to fetch screenshots from")
    parser.add_argument('--job-type-name', default="Mochitest Browser Screenshots",
                        help="Type of job to fetch from (aka. job_type_name) [Default='Mochitest Browser Screenshots']")
    parser.add_argument('--project', default="try",
                        help="Project that the revision is from. [Default=try]")
    args = parser.parse_args()
    fetch_screenshots(args.rev, args.project, args.job_type_name)


if __name__ == "__main__":
    cli()
