// Tiny DOM helpers. Text is always set through text nodes, never parsed as
// HTML, so user input cannot inject markup.

const SVG_NS = 'http://www.w3.org/2000/svg';

function setProps(element, props) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') element.setAttribute('class', value);
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value' && 'value' in element) element.value = value;
    else if (key === 'checked' && 'checked' in element) element.checked = Boolean(value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
}

function appendChildren(element, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** h('a', { href: '#/x', class: 'link' }, 'Text', otherNode) */
export function h(tag, props, ...children) {
  const element = document.createElement(tag);
  setProps(element, props);
  appendChildren(element, children);
  return element;
}

/** Same as h, for SVG elements. */
export function s(tag, props, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  setProps(element, props);
  appendChildren(element, children);
  return element;
}

export function clear(element) {
  while (element.firstChild) element.firstChild.remove();
  return element;
}
