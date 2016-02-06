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
    if (missingParams.length) {
      this.form[missingParams[0]].focus();
    } else {
      if (this.form.checkValidity()) {
        document.querySelector("form button[type='submit']").click();
      }
    }
  },

  generateURL: function() {
    let url = new URL(window.location.href);
    url.search = "";
    for (let param of ["oldProject", "oldRev", "newProject", "newRev"]) {
      url.searchParams.append(param, this.form[param].value.trim());
    }
    return url;
  },

  compare: function(evt) {
    console.info("compare");
    // TODO: cancel pending work if submitted again. Simple way is to not preventDefault
    evt.preventDefault();

    document.querySelector("progress").hidden = false;
    window.history.pushState({}, document.title, this.generateURL());

    this.oldProject = this.form["oldProject"].value.trim();
    this.newProject = this.form["newProject"].value.trim();
    this.oldRev = this.form["oldRev"].value.trim();
    this.newRev = this.form["newRev"].value.trim();

    this.comparisonsByPlatform = new Map();
    this.resultsetsByID = new Map();
    this.screenshotsByJob = new Map();

    // TODO: update query params
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
      .then(() => {
        this.updateDisplay();
        document.querySelector("progress").hidden = true;
      })
      .catch((error) => {
        document.querySelector("progress").hidden = true;
        console.error(error);
      });
  },

  fetchComparisons: function() {
    let promises = [];
    let platforms = new Set([...this.screenshotsByJob.keys()].map((job) => {
      return job.platform;
    }));
    for (let platform of platforms) {
      let p = platform;
      promises.push(this.getJSON(`http://screenshots.mattn.ca/comparisons/${this.oldProject}/${this.oldRev}/` +
                   `${this.newProject}/${this.newRev}/${platform}/comparison.json`)
                    .then((xhr) => {
                      this.comparisonsByPlatform.set(p, xhr.response);
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
    link.href = `https://treeherder.mozilla.org/#/jobs?repo=${response.meta.repository}&revision=${response.meta.revision}`;
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
      screenshots.set(artifact.value.replace(/^[^_]+_/, ""), artifact.url);
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
        row.classList.add("different");
        diffCol2.textContent = comparison.difference;
        diffLink.textContent = "Compare";
        diffLink.href = `http://screenshots.mattn.ca/comparisons/${this.oldProject}/${this.oldRev}/`
          + `${this.newProject}/${this.newRev}/${platform}/${image}`;
        break;
      case this.RESULT.ERROR:
        row.classList.add("error");
        diffCol1.colSpan = 2;
        diffCol1.textContent = "Error";
        diffCol2.remove();
        break;
      case this.RESULT.MISSING_BEFORE:
      case this.RESULT.MISSING_AFTER:
        row.classList.add("missing");
        diffCol1.colSpan = 2;
        diffCol1.textContent = "Missing source image";
        diffCol2.remove();
        break;
    }
  },

  updateDisplay: function() {
    console.debug("updateDisplay");
    let jobsByPlatform = new Map();
    for (let job of this.screenshotsByJob.keys()) {
      let jobs = jobsByPlatform.get(job.platform) || [];
      jobs.push(job);
      jobsByPlatform.set(job.platform, jobs);
    }

    let osTableTemplate = document.getElementById("osTableTemplate");
    let rowTemplate = document.getElementById("screenshotRowTemplate");
    let results = document.getElementById("results");
    results.innerHTML = "";
    for (let [platform, jobs] of jobsByPlatform) {
      osTableTemplate.content.querySelector("summary").textContent = platform;
      let comparisons = this.comparisonsByPlatform.get(platform);
      let combinationNames = new Set();
      console.log(platform);
      for (let job of jobs) {
        for (let [name, URL] of this.screenshotsByJob.get(job)) {
          combinationNames.add(name);
        }
      }
      console.log(combinationNames);

      let osClone = document.importNode(osTableTemplate.content, true);
      let sortedCombos = [...combinationNames];
      sortedCombos.sort();
      for (let combo of sortedCombos) {
        let rowClone = document.importNode(rowTemplate.content, true);
        let tds = rowClone.querySelectorAll("td");

        if (comparisons) {
          let comp = comparisons[combo];
          if (comp) {
            this.updateComparisonCell(tds[4], combo, platform, comp);
          }
        }

        tds[0].textContent = combo.replace(/\.png$/, "");
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
      results.appendChild(osClone);
    }
  },

};

document.addEventListener("DOMContentLoaded", Compare.init.bind(Compare));
