/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Compare = {
  RESULT: {
    SIMILAR: 0,
    DIFFERENT: 1,
    ERROR: 2,
    MISSING_BEFORE: 3,
    MISSING_AFTER: 4,
    KNOWN_INCONSISTENCY: 5,
  },
  TREEHERDER_API: "https://treeherder.mozilla.org/api",

  comparisonsByPlatform: new Map(),
  form: null,
  resultsetsByID: new Map(),
  screenshotsByJob: new Map(),

  init: function() {
    console.log("init");
    this.form = document.getElementById("chooser");
    // Load from URL params
    let params = new URLSearchParams(window.location.search.slice(1));
    let missingParams = [];
    for (let param of ["oldProject", "oldRev", "newProject", "newRev"]) {
      let value = params.get(param);
      if (!value) {
        missingParams.push(param);
        continue;
      }
      this.form[param].value = value.trim();
    }

    this.form["filter"].value = params.has("filter") ? params.get("filter") : "";

    if (missingParams.length) {
      this.form[missingParams[0]].focus();
    } else {
      if (this.form.checkValidity()) {
        document.querySelector("form button[type='submit']").click();
      }
    }

    this.filterChanged.call(this.form["hideSimilar"]);
    this.filterChanged.call(this.form["hideKnownInconsistencies"]);
    this.form["hideSimilar"].addEventListener("change", this.filterChanged);
    this.form["hideKnownInconsistencies"].addEventListener("change", this.filterChanged);

    this.form["filter"].addEventListener("input", this.filterChanged);

    this.populateSuggestedRevisions();
  },

  filterChanged: function() {
    document.getElementById("results").classList.toggle(this.name, this.checked);
    Compare.applyRegexFilter();
    Compare.updateURL({ replace: true });
  },

  applyRegexFilter: function() {
    let filterRegexp = new RegExp((this.form["filter"].value), "i");
    for (var row of document.querySelectorAll("#results > details > table > tbody > tr")) {
      row.classList.toggle("textMismatch", row.id.search(filterRegexp) == -1);
    }
  },

  updatePushlogLink: function() {
    var pushlog = document.getElementById("pushlog");
    if (this.oldProject == this.newProject) {
      pushlog.querySelector("a").href = `https://hg.mozilla.org/` +
        `${this.form.oldProject.value.trim()}` +
        `/pushloghtml?fromchange=${this.form.oldRev.value.trim()}` +
        `&tochange=${this.form.newRev.value.trim()}`;
      pushlog.hidden = false;
    } else {
      pushlog.hidden = true;
    }
  },

  generateURL: function() {
    let url = new URL(window.location.href);
    url.search = "";
    for (let param of ["oldProject", "oldRev", "newProject", "newRev", "filter"]) {
      let trimmed = this.form[param].value.trim();
      if (!trimmed) {
        continue;
      }
      url.searchParams.append(param, trimmed);
    }
    return url;
  },

  updateURL: function(args = {}) {
    try {
      window.history[args.replace ? "replaceState" : "pushState"]({}, document.title, this.generateURL());
    } catch (ex) {
      alert("The page URL couldn't be updated likely because your browser doesn't support URL.searchParams :(");
      console.error(ex);
    }
  },

  populateSuggestedRevisions: function() {
    let dateOptions = {
      hour12: false,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric"
    };
    let dateFormat = new Intl.DateTimeFormat(undefined, dateOptions);

    this.fetchRecentScreenshotJobsWithScreenshots().then((resultsets) => {
      let mcRevs = document.getElementById("mcRevs");
      for (let resultset of resultsets) {
        let pushDate = new Date(resultset.push_timestamp * 1000);
        let option = new Option(dateFormat.format(pushDate) + " (m-c: " + resultset.revision + ")",
                                resultset.revision);
        mcRevs.appendChild(option);
      }
    });
  },

  fetchRecentScreenshotJobsWithScreenshots: function(project = "mozilla-central") {
    let date = new Date();
    // Subtract 6 days from now
    date.setDate(date.getDate() - 6);
    let isoEarliestDate = date.toISOString();
    let jobs = [];
    return this.getJSON(this.TREEHERDER_API + `/project/${project}/jobs/?count=5000&exclusion_profile=false` +
                 `&job_type_name=Mochitest%20Browser%20Screenshots&result=success&last_modified__gte=${isoEarliestDate}`)
      .then((jobsXHR) => {
        jobs = jobsXHR.response.results;
        let jobIDSet = new Set(jobs.map((job) => {
          return job.id;
        }));
        return this.getJSON(this.TREEHERDER_API + `/project/${project}/artifact/?job_id__in=${[...jobIDSet].join(",")}&name=Job+Info&type=json&count=1000`);
      }).then((artifactsXHR) => {
        console.log(artifactsXHR);
        let jobIDsWithScreenshots = [];
        for (let artifacts of artifactsXHR.response) {
          let hasScreenshots = artifacts.blob.job_details.some((artifact) => {
            return artifact.content_type == "link"
              && artifact.value.endsWith(".png")
              && !artifact.value.startsWith("mozilla-test-fail-");
          });
          if (!hasScreenshots) {
            continue;
          }
          jobIDsWithScreenshots.push(artifacts.job_id);
        }

        let resultsetIDsWithScreenshots = new Set();
        for (let job of jobs) {
          if (jobIDsWithScreenshots.indexOf(job.id) == -1) {
            continue;
          }
          resultsetIDsWithScreenshots.add(job.result_set_id);
        }

        return resultsetIDsWithScreenshots;
      }).then((resultSetIDs) => {
        return this.getJSON(this.TREEHERDER_API + `/project/${project}/resultset/?id__in=${[...resultSetIDs].join(",")}`);
      }).then((resultsetsXHR) => {
        return resultsetsXHR.response.results;
      });
  },

  compare: function(evt) {
    console.info("compare");
    // TODO: cancel pending work if submitted again. Simple way is to not preventDefault
    evt.preventDefault();

    document.querySelector("progress").hidden = false;
    this.updateURL();

    this.oldProject = this.form["oldProject"].value.trim();
    this.newProject = this.form["newProject"].value.trim();
    this.oldRev = this.form["oldRev"].value.trim();
    this.newRev = this.form["newRev"].value.trim();

    this.updatePushlogLink();

    this.comparisonsByPlatform = new Map();
    this.resultsetsByID = new Map();
    this.screenshotsByJob = new Map();

    Promise.all([
      this.fetchResultset(this.oldProject, this.oldRev),
      this.fetchResultset(this.newProject, this.newRev),
    ]).then((resultsets) => {
      let promises = [];
      for (let rs of resultsets) {
        let response = rs.response;
        let type = response.meta.revision == this.oldRev
              && response.meta.repository == this.oldProject ? "old" : "new";
        this.handleResultset(type, response);
        promises.push(this.fetchJobsForResultset(response));
      }
      return Promise.all(promises);
    })
      .then(() => {
        return this.fetchComparisons();
      })
      .then((xhrs) => {
        // If an XHR returned null then the comparison likely hasn't been
        // performed yet so fire off a comparison for the revs.
        if (xhrs.some((xhr) => xhr.response === null)) {
          this.updateDisplay();
          return this.triggerComparisons()
            .then(() => {
              return this.fetchComparisons();
            });
        }
        return null;
      })
      .then(() => {
        this.updateDisplay();
        document.querySelector("progress").hidden = true;
      })
      .catch((error) => {
        document.querySelector("progress").hidden = true;
        console.error(error);
      });
  },

  triggerComparisons: function() {
    console.debug("triggerComparisons");
    let params = new URLSearchParams();
    for (let param of ["oldProject", "oldRev", "newProject", "newRev"]) {
      params.append(param, this.form[param].value.trim());
    }
    return this.getJSON("https://screenshots.mattn.ca/compare/cgi-bin/request_comparison.cgi?" + params.toString());
  },

  fetchComparisons: function() {
    let promises = [];
    let platforms = new Set([...this.screenshotsByJob.keys()].map((job) => {
      return job.platform;
    }));
    for (let platform of platforms) {
      let p = platform;
      promises.push(this.getJSON(`https://screenshots.mattn.ca/comparisons/${this.oldProject}/${this.oldRev}/` +
                   `${this.newProject}/${this.newRev}/${platform}/comparison.json`)
                    .then((xhr) => {
                      this.comparisonsByPlatform.set(p, xhr.response);
                      return xhr;
                    }));
    }
    return Promise.all(promises);
  },

  fetchResultset: function(project, rev) {
    var url = this.TREEHERDER_API + "/project/" + project
              + "/resultset/?count=2&full=true&revision=" + rev;
    return this.getJSON(url);
  },

  handleResultset: function(type, response) {
    let commitMsgEl = document.getElementById(type + "Commit");
    let link = commitMsgEl.querySelector("a");
    if (!response.meta.count) {
      this.form[type + "Rev"].focus();
      link.textContent = "No resultset found";
      link.removeAttribute("href");
      return;
    }
    let result = response.results[0];
    this.resultsetsByID.set(result.id, result);

    let dateOptions = {
      hour12: false,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric"
    };
    let pushDate = new Intl.DateTimeFormat(undefined, dateOptions).format(new Date(result.push_timestamp * 1000));

    document.getElementById(type + "Date").textContent = pushDate;
    link.textContent = result.comments;
    link.title = result.comments;
    link.href = `https://treeherder.mozilla.org/#/jobs?repo=${response.meta.repository}&revision=${response.meta.revision}&filter-tier=1&filter-tier=2&filter-tier=3&exclusion_profile=false`;
  },

  fetchJobsForResultset: function(resultset) {
    return this.getJSON(this.TREEHERDER_API + "/project/" + resultset.meta.repository + "/jobs/?count=2000&result_set_id=" + resultset.results[0].id + "&job_type_name=Mochitest%20Browser%20Screenshots&exclusion_profile=false").then((xhr) => {

      if (!xhr.response.results.length) {
        console.warn("No jobs found for resultset:", resultset.results[0]);
        return Promise.resolve("No jobs found for resultset:", resultset.results[0]);
      }
      let promises = [];
      for (let job of xhr.response.results) {
        let promise = this.fetchScreenshotsForJob(resultset.meta.repository, job)
          .then(function (job, screenshots) {
            this.screenshotsByJob.set(job, screenshots);
          }.bind(this, job));
        promises.push(promise);
      }
      return Promise.all(promises);
    });
  },

  fetchScreenshotsForJob: function(repository, job) {
    return this.getJSON(this.TREEHERDER_API + "/project/" + repository + "/artifact/?job_id="
                        + job.id + "&name=Job+Info&type=json")
      .then((xhr) => {
        return this.extractScreenshotArtifacts(xhr.response);
      });
  },

  extractScreenshotArtifacts: function(result) {
    let screenshots = new Map();
    if (!result.length) {
      return screenshots;
    }
    for (let artifact of result[0].blob.job_details) {
      if (artifact.content_type != "link" || !artifact.value.endsWith(".png")) {
        continue;
      }
      screenshots.set(artifact.value.replace(/^[^-_]+[-_]/, ""), artifact.url);
    }
    return screenshots;
  },

  getJSON: function(url) {
    return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.addEventListener("load", (evt) => resolve(evt.target));
      xhr.addEventListener("error", reject);
      xhr.addEventListener("abort", reject);
      xhr.open("GET", url, true);
      xhr.setRequestHeader("Accept", "application/json");
      xhr.responseType = "json";
      xhr.send();
    });
  },

  updateComparisonCell: function(diffCol2, image, platform, comparison) {
    let row = diffCol2.parentElement;
    let diffCol1 = diffCol2.previousElementSibling;
    let diffLink = diffCol1.querySelector(".diffLink");
    switch (comparison.result) {
      case this.RESULT.SIMILAR:
        row.classList.add("similar");
        diffCol1.textContent = comparison.difference;
        diffCol1.colSpan = 2;
        diffCol2.remove();
        break;
      case this.RESULT.DIFFERENT:
        if (platform == "windows7-32") {
          if (image.includes("_normal_") || image.includes("_tabsOutsideTitlebar") ||
              image.search(/^\d\d_prefs[^_]+\.png$/) === 0) {
          // Desktop icons, bug 1245719.
            row.classList.add("known_inconsistency");
          } else if (image.includes("_noLWT") && !image.includes("_fullScreen")) {
            row.classList.add("known_inconsistency");
          }
        }
        row.classList.add("different");
        diffCol2.textContent = comparison.difference;
        diffLink.textContent = "Compare";
        diffLink.href = `https://screenshots.mattn.ca/comparisons/${this.oldProject}/${this.oldRev}/`
          + `${this.newProject}/${this.newRev}/${platform}/${image}`;
        break;
      case this.RESULT.MISSING_BEFORE:
      case this.RESULT.MISSING_AFTER:
        let className;
        for (let resultName of Object.keys(this.RESULT)) {
          let resultNum = this.RESULT[resultName];
          if (resultNum == comparison.result) {
            className = resultName.toLowerCase();
            break;
          }
        }
        if (className) {
          row.classList.add(className);
        }
        diffCol1.colSpan = 2;
        diffCol1.textContent = "Missing source image";
        diffCol2.remove();
        break;
      case this.RESULT.ERROR:
        diffCol1.textContent = "Error";
        // Fall through
      default:
        if (!("result" in comparison)) {
          diffCol1.textContent = "No results";
        }
        diffCol1.colSpan = 2;
        diffCol2.remove();
        row.classList.add("error");
        break;
    }
  },

  updateDisplay: function() {
    console.debug("updateDisplay");
    let jobsByPlatform = new Map();
    let jobsSortedByPlatform = [...this.screenshotsByJob.keys()].sort((a, b) => {
      return a.platform.localeCompare(b.platform);
    });
    for (let job of jobsSortedByPlatform) {
      let jobs = jobsByPlatform.get(job.platform) || [];
      jobs.push(job);
      jobsByPlatform.set(job.platform, jobs);
    }

    let osTableTemplate = document.getElementById("osTableTemplate");
    let rowTemplate = document.getElementById("screenshotRowTemplate");
    let results = document.getElementById("results");
    results.innerHTML = "";
    for (let [platform, jobs] of jobsByPlatform) {
      let comparisons = this.comparisonsByPlatform.get(platform) || {};
      let combinationNames = new Set();
      for (let job of jobs) {
        for (let [name, URL] of this.screenshotsByJob.get(job)) {
          combinationNames.add(name);
        }
      }

      let osClone = document.importNode(osTableTemplate.content, true);
      let sortedCombos = [...combinationNames];
      sortedCombos.sort();
      for (let combo of sortedCombos) {
        let rowClone = document.importNode(rowTemplate.content, true);
        let tds = rowClone.querySelectorAll("td");

        let comp = comparisons[combo] || {};
        this.updateComparisonCell(tds[4], combo, platform, comp);

        var comboName = combo.replace(/\.png$/, "");
        tds[0].textContent = comboName;

        rowClone.querySelector("tr").id = platform + "_" + comboName;
        for (let job of jobs) {
          let url = this.screenshotsByJob.get(job).get(combo);
          if (!url) {
            continue;
          }
          let type = this.resultsetsByID.get(job.result_set_id).revision == this.oldRev
                ? "old" : "new";
          rowClone.querySelector("." + type + "Image").href = url;
        }

        osClone.querySelector("tbody").appendChild(rowClone);
      }
      let counts = Object.keys(this.RESULT).map((result) => {
        return osClone.querySelectorAll("tr." + result.toLowerCase()).length;
      });
      let summaryCategories = [
        [counts[this.RESULT.SIMILAR], "similar"],
        [counts[this.RESULT.DIFFERENT] - counts[this.RESULT.KNOWN_INCONSISTENCY], "different"],
        [counts[this.RESULT.KNOWN_INCONSISTENCY], "known inconsistencies"],
        [counts[this.RESULT.MISSING_AFTER] + counts[this.RESULT.MISSING_BEFORE], "missing"],
        [counts[this.RESULT.ERROR], "errors"]
      ];
      let summaryCounts = [];
      for (let [count, category] of summaryCategories) {
        if (count == 0) {
          continue;
        }
        summaryCounts.push(`<span class="${category}">${count} ${category}</span>`);
      }
      osClone.querySelector("summary").id = platform;
      osClone.querySelector("summary").innerHTML = `<h2>${platform}</h2><span>(` + summaryCounts.join(", ") + ")</span>";
      osClone.querySelector("thead > tr").classList.toggle("similar",
                                                           Object.keys(this.RESULT).every((result) => {
                                                             if (result == "SIMILAR") {
                                                               return counts[this.RESULT[result]] > 0;
                                                             }
                                                             return counts[this.RESULT[result]] == 0;
                                                           }));
      osClone.querySelector("thead > tr").classList.toggle("known_inconsistency", counts[this.RESULT.DIFFERENT] > 0 &&
                                                           counts[this.RESULT.KNOWN_INCONSISTENCY] == counts[this.RESULT.DIFFERENT] &&
                                                          counts[this.RESULT.MISSING_AFTER] + counts[this.RESULT.MISSING_BEFORE] + counts[this.RESULT.ERROR] == 0);
      results.appendChild(osClone);
    }
    this.applyRegexFilter();
  },

};

document.addEventListener("DOMContentLoaded", Compare.init.bind(Compare));
