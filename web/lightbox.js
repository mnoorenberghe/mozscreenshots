/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "https://cdn.jsdelivr.net/gh/mnoorenberghe/glightbox@patch-1/dist/js/glightbox.js";
import Cropper from "https://cdn.jsdelivr.net/gh/fengyuanchen/cropperjs@v1.5.6/dist/cropper.esm.js";

const IMAGE_LINK_SELECTORS = ".oldImage[href], .newImage[href], .diffLink[href]";

let lightbox = null;
let pushedStateToShow = false;

// Keep track of the last viewed <a> so we can focus it when the lightbox closes
// so the user knows where they left off.
let lastViewedLink = null;
// To preload the images for the adjacent rows:
let prevImg = new Image();
let nextImg = new Image();

export class Lightbox {
  static init() {
    window.addEventListener("dblclick", Lightbox.onDblClick);
    window.addEventListener("click", Lightbox.onClick);
    window.addEventListener("change", Lightbox.onChange);
    window.addEventListener("keydown", Lightbox.onKeyDown);
    window.addEventListener("popstate", Lightbox.onPopState);
  }

  static onPopState(event) {
    let matches = window.location.hash.match(/^#(([^_]+)_.*)$/);
    let fragmentPrefix = matches ? matches[2] : null;
    console.log(fragmentPrefix);
    if (!fragmentPrefix || !["old", "new", "diff"].includes(fragmentPrefix)) {
      if (lightbox) {
        lightbox.close();
      }
      return;
    }

    let el = document.getElementById(matches[1]);
    if (!el) {
      return;
    }

    el.click();
    console.info("restored state");
  }

  static onKeyDown(event) {
    if (!lightbox) {
      return;
    }

    switch (event.key) {
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
      case "c": {
        if (!lightbox) {
          return;
        }
        let activeSlide = lightbox.getActiveSlide();
        let cropButton = activeSlide.querySelector(".cropButton");
        if (cropButton) {
          cropButton.click();
        }
        break;
      }
      case "f": {
        if (!lightbox) {
          return;
        }
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
        break;
      }
      default: {
        // Avoid the code for all of these below.
        return;
      }
    }

    event.preventDefault();
  }

  static onDblClick(event) {
    let slideMedia = event.target.closest(".gslide-media");
    if (!slideMedia) {
      return;
    }
    let originalImage = slideMedia.querySelector(".cropper-hidden");
    if (!originalImage) {
      // Not in cropping mode
      return;
    }

    let {cropper} = originalImage;
    let {width, height, x, y} = cropper.getData(true);
    window.open(originalImage.src.replace(/.png$/, `_crop${width}x${height},${x},${y}.png`));
    cropper.destroy();

    event.preventDefault();
  }

  static onChange(event) {
    if (!event.target.matches(".cropButton")) {
      return;
    }

    let currentSlideImg = lightbox.getActiveSlide().querySelector(".gslide-media img");
    if (currentSlideImg.cropper) {
      currentSlideImg.cropper.destroy();
      return;
    }

    let linkIndex = lightbox.getActiveSlideIndex();
    let activeLink = lightbox.elements[linkIndex].link;

    let cropper = new Cropper(currentSlideImg, {
      autoCrop: false,
      checkOrientation: false,
      guides: false,
      rotatable: false,
      toggleDragModeOnDblclick: false,
      viewMode: 1,
      zoomable: false,
      ready() {
        if (!activeLink) {
          return;
        }

        let left = parseInt(activeLink.dataset.differenceBoundsLeft);
        if (Number.isNaN(left)) {
          // Old comparisons don't have bounds.
          return;
        }
        let top = parseInt(activeLink.dataset.differenceBoundsTop);
        let right = parseInt(activeLink.dataset.differenceBoundsRight);
        let bottom = parseInt(activeLink.dataset.differenceBoundsBottom);

        let padding = 50;
        let data = {
          x: left - padding,
          y: top - padding,
          width: right - left + 2 * padding,
          height: bottom - top + 2 * padding,
          rotate: 0,
          scaleX: 1,
          scaleY: 1,
        };

        this.cropper.crop().setData(data);
      },
    });
  }

  static onClick(event) {
    if (event.target.closest(".fullScreenButton")) {
      document.documentElement.requestFullscreen();
      return;
    }

    if (!event.target.matches(IMAGE_LINK_SELECTORS)) {
      return;
    }

    if (lightbox) {
      // Close it if it's already open since it doesn't handle re-opening properly.
      lightbox.close();
    }

    Lightbox.showForRow(event.target, event.isTrusted);
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
      href: link.dataset.img,
      // Use lazy getters to improve performance
      get title() {
        return parentElement.parentElement.cells[0].firstChild.textContent.replace(/_/g, "_<wbr>");
      },
      get description() {
        let desc = parentElement.closest("details").querySelector("summary h2").textContent +
            ` / ${description}`;
        if (parentElement.title) {
          desc += ` / ${parentElement.title}`;
        }
        // TODO: Can only crop on server with comparison (animated PNG). Do this check better.
        if (!["Base", "New"].includes(description)) {
          desc += `<label class="cropButtonLabel">
                     <input class="cropButton" type="checkbox" style="position:absolute; left: -100vh">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"  width="20" height="20" viewBox="0 0 24 24">
   <title>Crop Image (c). Double-click the cropped region to finish.</title>
   <path fill="currentColor" d="M7,17V1H5V5H1V7H5V17A2,2 0 0,0 7,19H17V23H19V19H23V17M17,15H19V7C19,5.89 18.1,5 17,5H9V7H17V15Z" />
</svg>

                   </label>`;
        }
        if (document.fullscreenEnabled) {
          desc += ` <button type="button" class="fullScreenButton" title="Fullscreen (f)">
<svg style="width:20px;height:20px" viewBox="3 3 18 18">
    <path fill="currentColor" d="M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z" />
</svg>
</button>`;
        }
        return desc;
      },
      link,
    };
  }

  static showForRow(startEl, pushState = false) {
    let row = startEl.closest("tr");
    let rowLinks = [...row.querySelectorAll(IMAGE_LINK_SELECTORS)];
    let startAt = rowLinks.indexOf(startEl);
    let elements = rowLinks.map((link, i) => {
      let description = link.textContent;
      return Lightbox.linkToSlide(link, description);
    });

    if (pushState) {
      // If the user clicked to open a lightbox (not .click()) push a new state.
      window.history.pushState({}, document.title, "#" + startEl.id);
    }
    pushedStateToShow = pushState;

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
        window.history.replaceState(null, document.title, "#" + activeLink.id);

        // Preload next row's image (columns are handled by GLightbox)
        // Note: Assuming single class on image links.
        let visibleOfType = Lightbox.getVisibleMatchingSelector("." + activeLink.className);
        let i = visibleOfType.indexOf(activeLink);
        let nextVisibleOfType = visibleOfType[i + 1];
        if (nextVisibleOfType) {
          nextImg.src = nextVisibleOfType.href;
        }
        let prevVisibleOfType = visibleOfType[i - 1];
        if (prevVisibleOfType) {
          prevImg.src = prevVisibleOfType.href;
        }
      },
      beforeSlideChange() {
        let activeSlide = lightbox.getActiveSlide();
        let currentSlideImg = activeSlide.querySelector(".gslide-media img");
        if (currentSlideImg && currentSlideImg.cropper) {
          currentSlideImg.cropper.destroy();
        }

        let cropButton = activeSlide.querySelector(".cropButton");
        if (cropButton) {
          cropButton.checked = false;
        }
      },
      onClose() {
        lightbox = null;
        setTimeout(() => {
          if (!lightbox) {
            // Prevent moving focus and showing the browser hover tooltip when
            // navigating vertically since we close and re-open then.
            lastViewedLink.focus();
            // We can't differentiate between a close from this file vs. one from the user.
            if (pushedStateToShow) {
              window.history.back();
            } else {
              let newURL = new URL(window.location.href);
              newURL.hash = "";
              window.history.pushState({}, document.title, newURL.toString());
            }
          }
        }, 0);
      },
      // No effects so jumping between separate instances is more seamless.
      closeEffect: "none",
      openEffect: "none",
      slideEffect: "none",
      svg: {
        // Copied to add <title> for a11y.
        close: '<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><title>Close</title><g><g><path d="M505.943,6.058c-8.077-8.077-21.172-8.077-29.249,0L6.058,476.693c-8.077,8.077-8.077,21.172,0,29.249C10.096,509.982,15.39,512,20.683,512c5.293,0,10.586-2.019,14.625-6.059L505.943,35.306C514.019,27.23,514.019,14.135,505.943,6.058z"/></g></g><g><g><path d="M505.942,476.694L35.306,6.059c-8.076-8.077-21.172-8.077-29.248,0c-8.077,8.076-8.077,21.171,0,29.248l470.636,470.636c4.038,4.039,9.332,6.058,14.625,6.058c5.293,0,10.587-2.019,14.624-6.057C514.018,497.866,514.018,484.771,505.942,476.694z"/></g></g></svg>',
        next: '<svg version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 477.175 477.175" xml:space="preserve"><title>Next</title><g><path d="M360.731,229.075l-225.1-225.1c-5.3-5.3-13.8-5.3-19.1,0s-5.3,13.8,0,19.1l215.5,215.5l-215.5,215.5c-5.3,5.3-5.3,13.8,0,19.1c2.6,2.6,6.1,4,9.5,4c3.4,0,6.9-1.3,9.5-4l225.1-225.1C365.931,242.875,365.931,234.275,360.731,229.075z"/></g></svg>',
        prev: '<svg version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 477.175 477.175" xml:space="preserve"><title>Previous</title><g><path d="M145.188,238.575l215.5-215.5c5.3-5.3,5.3-13.8,0-19.1s-13.8-5.3-19.1,0l-225.1,225.1c-5.3,5.3-5.3,13.8,0,19.1l225.1,225c2.6,2.6,6.1,4,9.5,4s6.9-1.3,9.5-4c5.3-5.3,5.3-13.8,0-19.1L145.188,238.575z"/></g></svg>'
      },
      ...options,
    });
    lightbox.open();
  }
}

Lightbox.init();
