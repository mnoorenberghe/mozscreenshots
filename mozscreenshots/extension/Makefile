# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

BUILD_DIR=build
XPI=mozscreenshots-$(RUN).xpi

help:
	@echo "Make targets:"
	@echo "  package	Builds the test run specified by the RUN environment variable."
	@echo "  clean		Cleans the package directory of the specified test run or the entire"
	@echo "                 package directory if RUN is not set."
	@echo "\nExample: 	RUN=XXX make package"

# Ensure that the RUN environment variable is set.
check_args:
	@if [ -z "$(RUN)" ]; then \
		echo "The RUN environment variable must be set to the test run directory name."; \
		exit 1; \
	fi

package: check_args
	@echo "Packaging: $(RUN)"

	mkdir -p "$(BUILD_DIR)/$(RUN)"
	cp -r configurations/ "$(BUILD_DIR)/$(RUN)/configurations"
	cp -r lib/ "$(BUILD_DIR)/$(RUN)/lib"
	cp -a bootstrap.js "$(BUILD_DIR)/$(RUN)"
	cp -a install.rdf "$(BUILD_DIR)/$(RUN)"
	cp -a chrome.manifest "$(BUILD_DIR)/$(RUN)"
	cp -a TestRunner.jsm "$(BUILD_DIR)/$(RUN)"

# 	Clean up unwanted files
	find "$(BUILD_DIR)/$(RUN)" -depth -name '*~' -exec rm -rf "{}" \;
	find "$(BUILD_DIR)/$(RUN)" -depth -name '#*' -exec rm -rf "{}" \;
	find "$(BUILD_DIR)/$(RUN)" -depth -name '.DS_Store' -exec rm "{}" \;
	find "$(BUILD_DIR)/$(RUN)" -depth -name 'Thumbs.db' -exec rm "{}" \;

# 	Create the XPI
	rm -f "$(BUILD_DIR)/$(XPI)"
	cd $(BUILD_DIR)/$(RUN) && zip -qr9XD "../$(XPI)" * && cd ../..
	@echo "Done: $(BUILD_DIR)/$(XPI)"

clean:
	rm -Rf "$(BUILD_DIR)/$(RUN)"
	rm -f "$(BUILD_DIR)/$(XPI)"
