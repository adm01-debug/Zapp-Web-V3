import DOMPurifyFactory from 'dompurify';
import { JSDOM } from 'jsdom';

// Create a DOM for DOMPurify to work with
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const window = dom.window;
const DOMPurify = DOMPurifyFactory(window);

const config = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'a'],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};

const testCases = [
  '<b>bold</b>',
  '<a href="https://example.com">link</a>',
  '<span>test</span>',
  '<script>alert(1)</script>',
  '<div>content</div>',
];

console.log('DOMPurify config:', JSON.stringify(config, null, 2));
testCases.forEach(html => {
  const result = DOMPurify.sanitize(html, config);
  console.log(`Input:  ${html}`);
  console.log(`Output: ${result}`);
  console.log('---');
});
