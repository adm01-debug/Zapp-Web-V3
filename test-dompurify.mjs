import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
global.window = window;
global.document = window.document;

const config = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'a'],
  ALLOWED_ATTR: ['href', 'title', 'target'],
  KEEP_CONTENT: true,
  FORCE_BODY: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};

const input = '<b>bold</b> <i>italic</i> <p>paragraph</p>';
const result = DOMPurify.sanitize(input, config);
console.log('Input:', input);
console.log('Output:', result);
console.log('Type:', typeof result);
