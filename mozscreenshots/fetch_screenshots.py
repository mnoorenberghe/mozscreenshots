# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import json
import logging
import os
import pprint
import requests
import sys

TH_API = 'https://treeherder.mozilla.org/api'

log = logging.getLogger('fetch_screenshots')
handler = logging.StreamHandler(sys.stdout)
log.addHandler(handler)

def resultset_response_for_push(project, rev):
    print 'Fetching result set for revision: %s' % rev
    resultset_url = '%s/project/%s/resultset/?count=2&full=true&revision=%s' % (TH_API, project, rev)
    log.info(resultset_url)
    resultset = requests.get(resultset_url).json()

    if len(resultset['results']) == 0:
        log.error('No result set for revision: %s' % rev)
        return None
    elif len(resultset['results']) > 1:
        log.error('Multiple result sets for revision: %s' % rev)
        return None
    log.debug('resultset_for_push: %s' % pprint.pformat(resultset['results'][0]))
    return resultset

def jobs_for_resultset(project, resultset_id, job_type_name):
    print 'Fetching jobs for resultset: %d' % resultset_id

    jobs_url = '%s/project/%s/jobs/?count=2000&result_set_id=%d&job_type_name=%s' % (TH_API, project, resultset_id, job_type_name)
    log.info(jobs_url)
    jobs = requests.get(jobs_url).json()
    if len(jobs['results']) == 0:
        log.error('No jobs found for resultset: %d' % resultset_id)
        return None
    log.debug('jobs_for_resultset: %s' % pprint.pformat(jobs))
    return jobs['results']

def download_image_artifacts_for_job(project, job, dir_path):
    print 'Fetching artifact list for job: %d' % job['id']
    artifacts_url = '%s/project/%s/artifact/?job_id=%d&name=Job+Info&type=json' % (TH_API, project, job['id'])
    log.debug(artifacts_url)
    artifacts = requests.get(artifacts_url).json()

    job_dir = os.path.join(dir_path, '%s-%s' % (job['platform'], job['id']))
    try:
        os.makedirs(job_dir)
    except OSError:
        if not os.path.isdir(job_dir):
            log.error('Error creating directory: %s' % job_dir)
            return

    for artifact in artifacts:
        if 'blob' not in artifact:
            log.debug('No blob in artifact: %d' % artifact['id'])
            continue

        blob = artifact['blob']

        if 'job_details' not in blob:
            log.debug('No job_details in artifact blob: %d' % artifact['id'])
            continue

        job_details = blob['job_details']

        for detail in job_details:
            log.debug('artifact blob job detail: %s' % pprint.pformat(detail))
            if not detail['value'].endswith('.png'):
                continue
            download_artifact(detail['url'], os.path.join(job_dir, detail['value']))

def download_artifact(url, filepath):
    print 'Downloading %s' % filepath,
    if os.path.isfile(filepath):
        print '- Not overwriting existing file'
        return
    else:
        print
    image = requests.get(url)
    file = open(filepath, 'wb')
    file.write(image.content)
    file.close()

def run(args):
    resultset_response = resultset_response_for_push(args.project, args.rev)
    if not resultset_response:
        sys.exit(1)
    resultset = resultset_response['results'][0]

    jobs = jobs_for_resultset(args.project, resultset['id'], args.job_type_name)
    if not jobs:
        sys.exit(1)

    rev_dir = os.path.join(resultset_response['meta']['repository'], resultset['revision'])
    try:
        os.makedirs(rev_dir)
    except OSError:
        if not os.path.isdir(rev_dir):
            log.error('Error creating directory: %s' % rev_dir)
            sys.exit(1)

    for job in jobs:
        download_image_artifacts_for_job(args.project, job, rev_dir)

def cli():
    parser = argparse.ArgumentParser(description='Fetch screenshots from automation')
    parser.add_argument('-r', '--rev', required=True,
                        help='Revision to fetch screenshots from')
    parser.add_argument('--job-type-name', default='Mochitest Browser Screenshots',
                        help='Type of job to fetch from (aka. job_type_name) [Default="Mochitest Browser Screenshots"]')
    parser.add_argument('--project', default='try',
                        help='Project that the revision is from. [Default=try]')
    parser.add_argument('--log-level', default='WARNING')
    args = parser.parse_args()
    log.setLevel(getattr(logging, args.log_level))

    run(args)

if __name__ == '__main__':
    cli()
