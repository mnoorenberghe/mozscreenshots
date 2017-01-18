# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

from setuptools import setup

PACKAGE_NAME = 'mozscreenshots'
PACKAGE_VERSION = '0.4.0'

desc = """Takes screenshots of different states of a Mozilla application"""

deps = [
    'mozrunner >= 5.0',
    'requests == 2.7.0',
]

setup(name=PACKAGE_NAME,
      version=PACKAGE_VERSION,
      description=desc,
      long_description="",
      classifiers=['Environment :: Console',
                   'Intended Audience :: Developers',
                   'License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)',
                   'Natural Language :: English',
                   'Operating System :: OS Independent',
                   'Programming Language :: JavaScript',
                   'Programming Language :: Python',
                   'Topic :: Software Development :: Libraries :: Python Modules',
                   ],
      keywords=['mozilla', 'screenshots', 'Firefox'],
      author='Matthew Noorenberghe',
      author_email='MattN+mozscreenshots@mozilla.com',
      url='https://github.com/mnoorenberghe/mozscreenshots',
      download_url='https://github.com/mnoorenberghe/mozscreenshots/tarball/' + PACKAGE_VERSION,
      license='MPL 2.0',
      packages=['mozscreenshots'],
      package_dir={'mozscreenshots': 'mozscreenshots'},
      package_data={'mozscreenshots': [
            'extension/*.*',
            'extension/configurations/*.jsm',
            'extension/lib/*.*',
            'prefs.json'
            ]},
      zip_safe=False,
      install_requires = deps,
      entry_points="""
# -*- Entry points: -*-
[console_scripts]
mozscreenshots = mozscreenshots:cli
fetch_screenshots = mozscreenshots.fetch_screenshots:cli
compare_screenshots = mozscreenshots.compare_screenshots:cli
""",
    )
