#!/usr/bin/env python

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

import optparse
import os
import subprocess
import sys

from mozrunner import CLI as MozRunnerCLI, runners


class CLI(MozRunnerCLI):
    """Command line interface."""

    module = "mozscreenshots"

    def __init__(self, args=sys.argv[1:]):
        """mozscreenshots command line entry point"""

        self.metadata = None
        if self.module in sys.modules:
            self.metadata = getattr(sys.modules[self.module],
                                    'package_metadata',
                                    {})
            version = self.metadata.get('Version')
            parser_args = {'description': self.metadata.get('Summary')}
            if version:
                parser_args['version'] = "%prog " + version

        self.parser = optparse.OptionParser()
        self.add_options(self.parser)
        (self.options, self.args) = self.parser.parse_args(args)

        if (self.options.list_sets):
            subprocess.call(["ls " + os.path.dirname(os.path.abspath(__file__)) + "/extension/configurations/*.jsm | sed -e 's/.*\///' | sed -e 's/\.jsm//' | xargs"], shell=True)
            sys.exit(0)
            return

        os.environ["MOZSCREENSHOTS_SETS"] = ",".join(self.args)
        if self.options.interactive:
            os.environ["MOZSCREENSHOTS_INTERACTIVE"] = "1"

        # choose appropriate runner and profile classes
        try:
            self.runner_class = runners[self.options.app]
        except KeyError:
            self.parser.error('Application "%s" unknown (should be one of "firefox" or "thunderbird")' % self.options.app)

    def add_options(self, parser):
        # add profile options
        MozRunnerCLI.add_options(self, parser)

        parser.add_option('--list-sets', dest='list_sets',
                          action='store_true',
                          help="List the available sets and exit.")

    def run(self):
        module_path = os.path.dirname(os.path.abspath(__file__))
        # append the mozscreenshots extension
        self.options.addons.append(module_path + '/extension/')

        # run in the foreground so we don't get screenshots of the console
        self.options.appArgs.append("--foreground")

        self.options.prefs_files.append(module_path + '/prefs.json')

        super(CLI, self).run()


def cli(args=sys.argv[1:]):
    CLI(args).run()

if __name__ == "__main__":
    cli()
