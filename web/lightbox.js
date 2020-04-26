/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "https://cdn.jsdelivr.net/gh/mnoorenberghe/glightbox@patch-1/dist/js/glightbox.min.js";

const IMAGE_LINK_SELECTORS = ".oldImage[href], .newImage[href], .diffLink[href]";

let lightbox = null;

// Keep track of the last viewed <a> so we can focus it when the lightbox closes
// so the user knows where they left off.
let lastViewedLink = null;

export class Lightbox {
  static init() {
    window.addEventListener("click", Lightbox.onClick);
    window.addEventListener("keydown", Lightbox.onKeyDown);
  }

  static onKeyDown(event) {
    if (!lightbox) {
      return;
    }

    switch (event.code) {
      case "ArrowDown":
      case "ArrowUp": {
        let offset = event.code == "ArrowDown" ? 1 : -1;
        let linkIndex = lightbox.getActiveSlideIndex();
        let currentLink = lightbox.elements[linkIndex].link;

        // Note: Assuming single class on image links.
        let visibleOfType = Lightbox.getVisibleMatchingSelector("." + currentLink.className);
        let i = visibleOfType.indexOf(currentLink);
        let nextVisibleOfType = visibleOfType[i + offset];
        if (!nextVisibleOfType) {
          break;
        }

        lightbox.close();

        Lightbox.showForRow(nextVisibleOfType);
        break;
      }
      default: {
        // Avoid the code for all of these below.
        return;
      }
    }

    event.preventDefault();
  }

  static onClick(event) {
    if (event.target.matches(".fullScreenButton")) {
      document.documentElement.requestFullscreen();
      return;
    }

    if (!event.target.matches(IMAGE_LINK_SELECTORS)) {
      return;
    }

    Lightbox.showForRow(event.target);
    event.preventDefault();
  }

  static isElementVisible(elem) {
    return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
  }

  static getVisibleMatchingSelector(selector) {
    let links = [...document.querySelectorAll(selector)];
    return links.filter(Lightbox.isElementVisible);
  }

  static linkToSlide(link, description) {
    let {href, parentElement} = link;
    return {
      type: "image",
      href,
      // Use lazy getters to improve performance
      get title() {
        return parentElement.parentElement.cells[0].textContent.replace(/_/g, "_<wbr>");
      },
      get description() {
        return parentElement.closest("details").querySelector("summary h2").textContent +
          ` / ${description} <button class="fullScreenButton">Fullscreen</button>`;
      },
      link,
    };
  }

  static showForRow(startEl) {
    let row = startEl.closest("tr");
    let rowLinks = [...row.querySelectorAll(IMAGE_LINK_SELECTORS)];
    let startAt = rowLinks.indexOf(startEl);
    let elements = rowLinks.map((link, i) => {
      let description = link.textContent;
      return Lightbox.linkToSlide(link, description);
    });
    Lightbox.show({
      elements,
      startAt,
    });
  }

  static show(options = {}) {
    lightbox = GLightbox({
      afterSlideChange() {
        let linkIndex = lightbox.getActiveSlideIndex();
        let activeLink = lightbox.elements[linkIndex].link;
        lastViewedLink = activeLink;
        history.replaceState(null, "", "#" + activeLink.closest("tr").id);
      },
      onClose() {
        lightbox = null;
        // TODO: this will happen when navigating vertically too since we close and re-open.
        lastViewedLink.focus();
      },
      // No effects so jumping between separate instances is more seamless.
      closeEffect: "none",
      openEffect: "none",
      slideEffect: "none",
      ...options,
    });
    lightbox.open();
  }
}

Lightbox.init();