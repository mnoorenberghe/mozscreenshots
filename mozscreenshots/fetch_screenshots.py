# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import concurrent.futures as cf
import json
import logging
import os
import pprint
import requests
import sys

from datetime import date, datetime, timedelta
from hashlib import sha512
from requests_futures.sessions import FuturesSession
from mozscreenshots import __version__


DEFAULT_REQUEST_HEADERS = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'mozscreenshots/%s' % __version__,
}
HASHED_IMAGE_PATH = 'sha512'
TC_API = 'https://index.taskcluster.net/v1'
TH_API = 'https://treeherder.mozilla.org/api'

log = logging.getLogger('fetch_screenshots')
handler = logging.StreamHandler(sys.stderr)
handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
log.addHandler(handler)

def resultset_response_for_id(project, resultset_id):
    print 'Fetching resultset for id: %d' % resultset_id
    resultset_url = '%s/project/%s/push/%s/' % (TH_API, project, resultset_id)
    log.info(resultset_url)
    try:
        json = fetch_json(resultset_url)
    except requests.exceptions.HTTPError:
        log.error('Invalid resultset for id: %d' % resultset_id)
        return None

    if not json['id']:
        log.error('No resultset for id: %s' % resultset_id)
        return None
    log.debug('resultset_response_for_id: %s' % pprint.pformat(json, depth=1))
    return json

def resultset_response_for_push(project, rev):
    print 'Fetching resultset for revision: %s' % rev
    resultset_url = '%s/project/%s/push/?count=2&full=true&revision=%s' % (TH_API, project, rev)
    log.info(resultset_url)
    response = fetch_json(resultset_url)

    if len(response['results']) == 0:
        log.error('No resultset for revision: %s' % rev)
        return None
    elif len(response['results']) > 1:
        log.error('Multiple resultsets for revision: %s' % rev)
        return None
    log.debug('resultset_for_push: %s' % pprint.pformat(response['results'][0]))
    return response

def jobs_for_resultset(project, resultset_id, job_type_name):
    print 'Fetching jobs for resultset: %d' % resultset_id

    jobs_url = '%s/project/%s/jobs/?count=2000&result_set_id=%d&job_type_name=%s&exclusion_profile=false' % (TH_API, project, resultset_id, job_type_name)
    log.info(jobs_url)
    jobs = fetch_json(jobs_url)
    if len(jobs['results']) == 0:
        log.error('No jobs found for resultset: %d' % resultset_id)
        return None
    log.debug('jobs_for_resultset: %s' % pprint.pformat(jobs))
    return jobs['results']

def makedirs(path):
    try:
        os.makedirs(path)
    except OSError:
        if not os.path.isdir(path):
            log.error('Error creating directory: %s' % path)
            sys.exit(1)


def download_image_artifacts_for_job(project, job, dir_path):
    print 'Fetching artifact list for job: %d (%s)' % (job['id'], job['job_guid'])
    artifacts_url = '%s/jobdetail/?job__guid=%s' % (TH_API, job['job_guid'])
    log.info(artifacts_url)
    details = fetch_json(artifacts_url)

    job_dir = os.path.join(dir_path, '%s-%s' % (job['platform'], job['id']))
    makedirs(job_dir)

    session = FuturesSession(max_workers = 5) # TODO
    request_futures = {}
    for detail in details['results']:
        log.debug('artifact blob job detail: %s' % pprint.pformat(detail))
        if not detail['value'].endswith('.png') or detail['value'].startswith('mozilla-test-fail-'):
            continue
        filepath = os.path.join(job_dir, detail['value'])
        future = request_artifact(session, detail['url'], filepath)
        if future:
            request_futures[future] = filepath

    for future in cf.as_completed(request_futures, timeout=600):
        res = future.result()
        filepath = request_futures[future]
        handle_artifact_download(res, filepath)

    # Remove any empty directories that we created
    try:
        os.rmdir(job_dir)
    except OSError:
        return job_dir
        pass


def request_artifact(session, url, filepath):
    ''' Returns a future or None '''
    print 'Requesting %s' % filepath,
    if os.path.isfile(filepath):
        print '- Not overwriting existing file'
        return
    print
    return session.get(url)

def handle_artifact_download(image, filepath):
    try:
        image.raise_for_status()
        sha512sum = sha512(image.content).hexdigest()
        print 'Download finished: %s (%s)' % (filepath, sha512sum)
        # Write data if the sha512 doesn't exist
        data_dir = os.path.join(HASHED_IMAGE_PATH, sha512sum[0], sha512sum[1])
        data_path = os.path.join(data_dir, sha512sum)
        if os.path.isfile(data_path):
            log.debug('Data file %s already exists' % data_path)
        else:
            makedirs(data_dir)
            file = open(data_path, 'wb')
            file.write(image.content)
            file.close()

        # Make a hard link to the data with the image file name
        os.link(data_path, filepath)
    except (requests.exceptions.HTTPError, requests.exceptions.ConnectionError) as e:
        print 'Download FAILED: %s' % filepath
        log.error('%s: %s\n\t%s %s' % (filepath, image.content, e.errno, e.strerror))

def nightly_revs_for_date(project, date):
    revs_url = '%s/namespaces/gecko.v2.%s.nightly.%s.revision' % (TC_API, project, date.replace('-', '.'))
    log.debug(revs_url)
    result = fetch_json(revs_url, "post")

    found_revs = set()
    for namespace in result['namespaces']:
        if namespace['name'] not in found_revs:
            found_revs.add(namespace['name']);
            log.debug('Found Nightly: %s' % (namespace['name'],))

    return found_revs

def resultsets_for_date(project, date):
    date_obj = datetime.strptime(date, '%Y-%m-%d')
    start_time = date_obj.strftime("%s")
    end_time = (date_obj + timedelta(days=1)).strftime("%s")
    revs_url = '{TH_API}/project/{project}/push/?push_timestamp__gte={start_time}&push_timestamp__lt={end_time}'.format(TH_API=TH_API, project=project, start_time=start_time, end_time=end_time)
    log.debug(revs_url)
    result = fetch_json(revs_url)

    found_resultset_ids = set()
    resultsets = []
    for resultset in result['results']:
        result_set_id = resultset['id']
        if result_set_id not in found_resultset_ids:
            found_resultset_ids.add(result_set_id);
            log.debug('Found result_set_id: %s' % (result_set_id,))
            resultsets.append(resultset_response_for_id(project, result_set_id))

    return resultsets

def fetch_json(url, method = "get"):
    response = getattr(requests, method)(url, headers=DEFAULT_REQUEST_HEADERS, timeout=30)
    response.raise_for_status()
    return response.json()

def run(args):
    resultsets = []
    if args.rev:
        resultset_response = resultset_response_for_push(args.project, args.rev)
        if not resultset_response:
            sys.exit(1)
        resultsets.append(resultset_response['results'][0])
    elif args.nightly:
        revs = nightly_revs_for_date(args.project, args.nightly)
        for rev in revs:
            resultset = resultset_response_for_push(args.project, rev)
            if not resultset:
                continue
            resultsets.append(resultset['results'][0])
    elif args.date:
        resultsets = resultsets_for_date(args.project, args.date)

    for resultset in resultsets:
        run_for_resultset(args, resultset)

def run_for_resultset(args, resultset):
    jobs = jobs_for_resultset(args.project, resultset['id'], args.job_type_name)
    if not jobs:
        sys.exit(1)

    rev_dir = os.path.join(args.project, resultset['revision'])
    makedirs(rev_dir)

    job_dirs = []
    for job in jobs:
        job_dir = download_image_artifacts_for_job(args.project, job, rev_dir)
        if not job_dir:
            continue
        job_dirs.append(job_dir)

    return job_dirs

def cli():
    parser = argparse.ArgumentParser(description='Fetch screenshots from automation')

    required = parser.add_mutually_exclusive_group(required=True)
    required.add_argument('-n', '--nightly', metavar='YYYY-MM-DD',
                          help='Date to fetch nightly screenshots from')
    required.add_argument('-d', '--date', metavar='YYYY-MM-DD',
                          help='Date to fetch screenshots from')
    required.add_argument('-r', '--rev',
                          help='Revision to fetch screenshots from')


    parser.add_argument('--job-type-name', default='Mochitest Browser Screenshots',
                        help='Type of job to fetch from (aka. job_type_name) [Default="Mochitest Browser Screenshots"]')
    parser.add_argument('--log-level', default='WARNING')

    parser.add_argument('--project',
                        help='Project that the revision is from. [Default="mozilla-central" for --nightly, "try" otherwise]')

    args = parser.parse_args()
    if not args.project:
        args.project = "mozilla-central" if args.nightly or args.date else "try"
    log.setLevel(getattr(logging, args.log_level))

    run(args)

if __name__ == '__main__':
    cli()
