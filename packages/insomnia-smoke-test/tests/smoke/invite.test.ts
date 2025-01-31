import { expect } from '@playwright/test';

import { test } from '../../playwright/test';
import { getUserEmail } from './test-utils';

const testUser = getUserEmail();

test('Can invite users in app', async ({ page }) => {
  await page.getByLabel('Invite collaborators').click();
  // have 5 members
  await expect(page.getByLabel('Invitation list').getByRole('option')).toHaveCount(0);
  // invite a new member
  await page.getByPlaceholder('Enter emails, separated by').click();
  await page.getByPlaceholder('Enter emails, separated by').fill(testUser);
  await page.getByRole('button', { name: 'Invite', exact: true }).click();

  // check if the new member is in the list
  // await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
});
