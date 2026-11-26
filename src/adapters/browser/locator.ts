import type { Page } from 'playwright';
import type { BrowserLocator } from '../../protocol/schemas/browser.ts';

export function browserLocator(page: Page, target: BrowserLocator) {
  switch (target.by) {
    case 'role': return page.getByRole(target.role, { name: target.name, exact: true });
    case 'label': return page.getByLabel(target.name, { exact: true });
    case 'testId': return page.getByTestId(target.name);
    case 'id': {
      // Encode each code point as a CSS escape. The id is data, never selector syntax.
      const id = Array.from(target.name, character => '\\' + character.codePointAt(0)!.toString(16) + ' ').join('');
      return page.locator('#' + id);
    }
  }
}
