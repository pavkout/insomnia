// import { expect } from '@playwright/test';

import { test } from '../../playwright/test';
import { getUserEmail } from './test-utils';

const testUser = getUserEmail();

test('Can invite users in app', async ({ page }) => {
  await page.getByLabel('Invite collaborators').click();

  // invite a new member
  await page.getByPlaceholder('Enter emails, separated by').click();
  await page.getByPlaceholder('Enter emails, separated by').fill(testUser);

  // Iterate through the first five options and click each one
  for (let i = 0; i < 5; i++) {
    const testId = `search-test-result-iteration-${i}`;
    await page.getByTestId(testId).click();
  }

  await page.getByText('Invite collaboratorsInsomnia').click();

  await page.getByRole('button', { name: 'Invite', exact: true }).click();

  // Check that the new member is in the list
  // await expect(page.getByLabel('Invitation list').getByRole('option')).toHaveCount(5);
});
