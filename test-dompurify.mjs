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
  { input: '<b>bold</b>', expected: '<b>bold</b>' },
  { input: '<a href="https://example.com">link</a>', expected: '<a href="https://example.com">link</a>' },
  { input: '<span>test</span>', expected: 'test' },
  { input: '<script>alert(1)</script>', expected: '' },
  { input: '<div>content</div>', expected: 'content' },
];

console.log('DOMPurify config:', JSON.stringify(config, null, 2));

let passedTests = 0;
let failedTests = 0;

testCases.forEach(({ input, expected }) => {
  const result = DOMPurify.sanitize(input, config);
  const passed = result === expected;

  console.log(`Input:    ${input}`);
  console.log(`Expected: ${expected}`);
  console.log(`Output:   ${result}`);
  console.log(`Status:   ${passed ? '✓ PASS' : '✗ FAIL'}`);
  console.log('---');

  if (passed) {
    passedTests++;
  } else {
    failedTests++;
  }
});

console.log(`\nResults: ${passedTests} passed, ${failedTests} failed`);

if (failedTests > 0) {
  process.exit(1);
}
