/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "https://cdn.jsdelivr.net/gh/mnoorenberghe/glightbox@patch-1/dist/js/glightbox.min.js";
import Cropper from "https://cdn.jsdelivr.net/gh/fengyuanchen/cropperjs@v1.5.6/dist/cropper.esm.js";

const IMAGE_LINK_SELECTORS = ".oldImage[href], .newImage[href], .diffLink[href]";

let lightbox = null;

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
        let desc = parentElement.closest("details").querySelector("summary h2").textContent +
            ` / ${description}`;
        if (parentElement.title) {
          desc += ` / ${parentElement.title}`;
        }
        if (document.fullscreenEnabled) {
          desc += ` <button type="button" class="fullScreenButton" title="fullscreen (f)">
<svg style="width:20px;height:20px" viewBox="3 3 18 18">
    <path fill="currentColor" d="M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z" />
</svg>
</button>`;
        }
        // TODO: Can only crop on server with comparison (animated PNG). Do this check better.
        if (!["Base", "New"].includes(description)) {
          desc += `<label>
                     <input class="cropButton" type="checkbox" style="position:absolute; left: -100vh">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"  width="20" height="20" viewBox="0 0 24 24">
   <title>Crop Image. Double-click the cropped region to finish.</title>
   <path fill="currentColor" d="M7,17V1H5V5H1V7H5V17A2,2 0 0,0 7,19H17V23H19V19H23V17M17,15H19V7C19,5.89 18.1,5 17,5H9V7H17V15Z" />
</svg>

                   </label>`;
        }
        return desc;
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
