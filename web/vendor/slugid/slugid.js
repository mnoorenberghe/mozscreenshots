// The MIT License (MIT)
//
// Copyright (c) 2014 Jonas Finnemann Jensen
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

//import uuidv4 from 'uuid/v4';

import uuidParse from '../uuid-parse/uuid-parse.js';

function typedArrayToBase64(bytes) {
  let binary = "";
  let len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode( bytes[ i ] );
  }
  return window.btoa( binary );
}

/**
 * Returns the given uuid as a 22 character slug. This can be a regular v4
 * slug or a "nice" slug.
 */
export const encode = function(uuid_) {
  var bytes   = uuidParse.parse(uuid_);
  var base64  = typedArrayToBase64(new Uint8Array(bytes));
  var slug = base64
              .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
              .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
              .substring(0, 22);    // Drop '==' padding
  return slug;
};

/**
 * Returns the uuid represented by the given v4 or "nice" slug
 */
export const decode = function(slug) {
  var base64 = slug
                  .replace(/-/g, '+')
                  .replace(/_/g, '/')
                  + '==';
  return uuidParse.unparse(new Buffer(base64, 'base64'));
};

/**
 * Returns a randomly generated uuid v4 compliant slug
 */
export const v4 = function() {
  var bytes   = uuidv4(null, new Buffer(16));
  var base64  = bytes.toString('base64');
  var slug = base64
              .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
              .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
              .substring(0, 22);    // Drop '==' padding
  return slug;
};

/**
 * Returns a randomly generated uuid v4 compliant slug which conforms to a set
 * of "nice" properties, at the cost of some entropy. Currently this means one
 * extra fixed bit (the first bit of the uuid is set to 0) which guarantees the
 * slug will begin with [A-Za-f]. For example such slugs don't require special
 * handling when used as command line parameters (whereas non-nice slugs may
 * start with `-` which can confuse command line tools).
 *
 * Potentially other "nice" properties may be added in future to further
 * restrict the range of potential uuids that may be generated.
 */
export const nice = function() {
  var bytes   = uuidv4(null, new Buffer(16));
  bytes[0] = bytes[0] & 0x7f;  // unset first bit to ensure [A-Za-f] first char
  var base64  = bytes.toString('base64');
  var slug = base64
              .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
              .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
              .substring(0, 22);    // Drop '==' padding
  return slug;
};
