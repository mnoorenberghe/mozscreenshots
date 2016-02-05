/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Compare = {
  TREEHERDER_API: "https://treeherder.mozilla.org/api",

  form: null,
  resultsetsByID: new Map(),
  screenshotsByJob: new Map(),

  init: function() {
    console.log("init");
    this.form = document.getElementById("chooser");
  },

  compare: function(evt) {
    evt.preventDefault();

    this.oldProject = this.form["oldProject"].value.trim();
    this.newProject = this.form["newProject"].value.trim();
    this.oldRev = this.form["oldRev"].value.trim();
    this.newRev = this.form["newRev"].value.trim();

    this.resultsetsByID = new Map();
    this.screenshotsByJob = new Map();

    // TODO: update query params
    Promise.all([
      this.fetchResultset(this.oldProject, this.oldRev),
      this.fetchResultset(this.newProject, this.newRev),
    ]).then((resultsets) => {
      for (let rs of resultsets) {
        let response = rs.response;
        let type = response.meta.revision == this.oldRev
              && response.meta.repository == this.oldProject ? "old" : "new";
        this.handleResultset(type, response);
        this.fetchJobsForResultset(response);
      }
      return resultsets;
    })
      .catch(console.error.bind(console));
  },


  fetchResultset: function(project, rev) {
    var url = this.TREEHERDER_API + "/project/" + project
              + "/resultset/?count=2&full=true&revision=" + rev;
    return this.getJSON(url);
  },

  handleResultset: function(type, response) {
    var commitMsgEl = document.getElementById(type + "Commit");
    if (!response.meta.count) {
      this.form[type + "Rev"].focus();
      commitMsgEl.textContent = "No resultset found";
      return;
    }
    let result = response.results[0];
    this.resultsetsByID.set(result.id, result);
    document.getElementById(type + "Date").textContent = new Date(result.push_timestamp * 1000);
    commitMsgEl.textContent = result.comments;
    commitMsgEl.title = result.comments;
  },

  fetchJobsForResultset: function(resultset) {
    return this.getJSON(this.TREEHERDER_API + "/project/" + resultset.meta.repository + "/jobs/?count=2000&result_set_id=" + resultset.results[0].id + "&job_type_name=Mochitest%20Browser%20Screenshots&exclusion_profile=false").then((xhr) => {

      if (!xhr.response.results.length) {
        console.warn("No jobs found for resultset:", resultset.results[0]);
        return;
      }
      for (let job of xhr.response.results) {
        this.fetchScreenshotsForJob(resultset.meta.repository, job)
          .then(function (job, screenshots) {
            this.screenshotsByJob.set(job, screenshots);
          }.bind(this, job));
      }
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
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.responseType = "json";
      xhr.send();
    });
  },

  updateDisplay: function() {
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
