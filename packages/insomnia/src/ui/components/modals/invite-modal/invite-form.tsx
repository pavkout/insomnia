import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, type Key, ListBox, ListBoxItem, type ListBoxItemProps, Popover, Tooltip, TooltipTrigger } from 'react-aria-components';
import { useFetcher, useParams, useSearchParams } from 'react-router-dom';

import { decryptRSAWithJWK, encryptRSAWithJWK } from '../../../../account/crypt';
import { getCurrentSessionId, getPrivateKey } from '../../../../account/session';
import { debounce } from '../../../../common/misc';
import { SegmentEvent } from '../../../analytics';
import { insomniaFetch, ResponseFailError } from '../../../insomniaFetch';
import type { CollaboratorSearchLoaderResult } from '../../../routes/invite';
import { Icon } from '../../icon';
import { startInvite } from './encryption';
import { type PendingMember } from './invite-modal';
import { OrganizationMemberRolesSelector, type Role, SELECTOR_TYPE } from './organization-member-roles-selector';

export function getSearchParamsString(
  searchParams: URLSearchParams,
  changes: Record<string, string | number | undefined>,
) {
  const newSearchParams = new URLSearchParams(searchParams);

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) {
      newSearchParams.delete(key);
    } else {
      newSearchParams.set(key, String(value));
    }
  }

  return newSearchParams.toString();
}

interface EmailsInputProps {
  allRoles: Role[];
  onInviteCompleted?: () => void;
}

export interface EmailInput {
  email: string;
  isValid: boolean;
  picture?: string;
  teamId?: string;
};

const isValidEmail = (email: string): boolean => {
  const emailRegex = new RegExp(
    /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
  );

  return emailRegex.test(email);
};

const defaultRoleName = 'member';

export const InviteForm = ({
  allRoles,
  onInviteCompleted,
}: EmailsInputProps) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const organizationId = useParams().organizationId as string;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emails, setEmails] = useState<EmailInput[]>([]);
  const [showResults, setShowResults] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const selectedRoleRef = React.useRef<Role>(
    allRoles.find(role => role.name === defaultRoleName) as Role,
  );

  const collaboratorSearchLoader = useFetcher<CollaboratorSearchLoaderResult>();

  const searchResult = useMemo(() => collaboratorSearchLoader.data || [], [collaboratorSearchLoader.data]);

  useEffect(() => {
    if (searchResult.length > 0) {
      setShowResults(true);
    } else {
      setShowResults(false);
    }
  }, [searchResult]);

  const addEmail = ({ email, teamId, picture = 'https://static.insomnia.rest/insomnia-gorilla.png' }: { email: string; teamId?: string; picture?: string }) => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return;
    }

    if (emails.map(e => e.email).includes(trimmedEmail)) {
      // If the email is already in the list, move it to the end
      const emailToMove = emails.find(e => e.email === trimmedEmail);
      const updatedEmails = emails.filter(e => e.email !== trimmedEmail);
      setEmails([...updatedEmails, emailToMove as EmailInput]);
    } else if (!isValidEmail(trimmedEmail) && !teamId) {
      setEmails((prev: EmailInput[]) => [...prev, { email: trimmedEmail, isValid: false, teamId, picture }]);
    } else {
      setEmails((prev: EmailInput[]) => [...prev, { email: trimmedEmail, isValid: true, teamId, picture }]);
    }
  };

  const removeEmail = (emailToRemove: string) => {
    setEmails((prev: EmailInput[]) => prev.filter(({ email }: EmailInput) => email !== emailToRemove));
  };

  const handleInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === ',') {
      e.preventDefault();

      if (inputRef.current) {
        addEmail({ email: inputRef.current.value });
        inputRef.current.value = '';
      }
    }
  };

  const handleSearch = debounce((query: string) => {
    if (query.trim() !== '') {
      collaboratorSearchLoader.load(`/organization/${organizationId}/collaborators-search?query=${encodeURIComponent(query)}`);
      setSearchParams(getSearchParamsString(searchParams, { query }));
    }
  }, 500);

  const handleInputBlur = () => {
    if (inputRef.current && !showResults) {
      addEmail({ email: inputRef.current.value });
      inputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    const pastedText = e.clipboardData.getData('text');
    const emailsArray = pastedText.split(',');

    emailsArray.forEach((email: string) => addEmail({ email }));

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex gap-4 items-center w-full">
        <div className='flex flex-1 justify-between gap-3 bg-[--hl-xs] border border-[#4c4c4c] rounded-md p-2' ref={triggerRef}>
          <div
            className="flex flex-1 gap-3 overflow-y-auto flex-wrap items-center max-h-[200px]"
            onClick={() => inputRef.current?.focus()}
          >
            {emails.map(({ picture, email, isValid }: EmailInput) => (
              <span
                key={email}
                className={`bg-[--hl-xs] text-[--color-font] rounded-full flex gap-2 items-center pl-1 pr-2 text-sm leading-6 h-7 ${isValid ? 'bg-[--hl-xs]' : 'bg-orange-400 bg-opacity-40 border border-orange-400 border-dashed'}`}
              >
                <TooltipTrigger delay={0}>
                  <Button
                    className='flex gap-1 items-center'
                    onPress={() => {
                      if (inputRef.current) {
                        inputRef.current.value = email;
                        removeEmail(email);
                        handleSearch(email);
                        inputRef.current.focus();
                      }
                    }}
                  >
                    <img src={picture} alt="member image" className="w-5 h-5 rounded-full" />
                    <span className="flex items-center h-full">{`${email} ${isValid ? '' : '(Invalid)'}`}</span>
                  </Button>
                  <Tooltip
                    offset={8}
                    placement='top'
                    className="border select-none text-sm max-w-xs border-solid border-[--hl-sm] shadow-lg bg-[--color-bg] text-[--color-font] px-4 py-2 rounded-md overflow-y-auto max-h-[85vh] focus:outline-none"
                  >
                    Click to edit
                  </Tooltip>
                </TooltipTrigger>
                <Button
                  className="flex items-center justify-center h-full w-4"
                  onPress={() => {
                    setError('');
                    removeEmail(email);
                  }}
                >
                  <Icon icon="xmark" className='text-[--color-font] h-4 w-4 cursor-default' />
                </Button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              className="border-none leading-6 min-h-[24px] px-2 py-1 outline-none grow-[inherit]"
              placeholder={emails.length > 0 ? 'Enter more emails...' : 'Enter emails, separated by comma...'}
              onKeyDown={handleInputKeyPress}
              onBlur={handleInputBlur}
              onPaste={handlePaste}
              onChange={e => handleSearch(e.currentTarget.value)}
            />
          </div>
          <div className="flex items-center w-[81px]">
            <OrganizationMemberRolesSelector
              type={SELECTOR_TYPE.INVITE}
              availableRoles={allRoles}
              memberRoles={[defaultRoleName]}
              isDisabled={false}
              onRoleChange={async role => {
                selectedRoleRef.current = role;
              }}
            />
          </div>
        </div>
        <Button
          className="h-[40px] w-[67px] text-center bg-[#4000bf] rounded disabled:opacity-70 shrink-0 self-end text-[--color-font-surprise]"
          isDisabled={loading}
          onPress={() => {
            if (emails.some(({ isValid }) => !isValid)) {
              setError('Some emails are invalid, please correct them before inviting.');
              return;
            }

            setLoading(true);
            setError('');

            // Split emails into groups and individual emails
            const emailsToInvite = emails.filter(({ teamId }) => !teamId).map(({ email }) => email);
            const groupsToInvite = emails.filter(({ teamId }) => teamId).map(({ teamId }) => teamId as string);

            handleInvite({
              emails: emailsToInvite,
              groupIds: groupsToInvite,
              organizationId,
              role: selectedRoleRef.current,
            }).then(
              inviteeEmails => {
                window.main.trackSegmentEvent({
                  event: SegmentEvent.inviteMember,
                  properties: {
                    numberOfInvites: inviteeEmails.length,
                  },
                });

                setEmails((prev: EmailInput[]) => [...prev.filter(({ email, teamId }) => !inviteeEmails.includes(email) || (teamId && !inviteeEmails.includes(teamId)))]);
                onInviteCompleted?.();
              },
              (error: Error) => {
                setError(error.message);
              },
            ).finally(() => {
              setLoading(false);
            });
          }}
        >
          Invite
          {loading && (<Icon icon="spinner" className="animate-spin ml-[4px]" />)}
        </Button>
        <Popover
          placement="bottom start"
          className="w-[--trigger-width] rounded-md bg-[--color-bg] text-[--color-font] border border-solid border-[--hl-sm] shadow-md"
          ref={popoverRef}
          triggerRef={triggerRef}
          isOpen={showResults}
          onOpenChange={setShowResults}
        >
          <ListBox
            className="p-1 outline-none"
            selectionMode="single"
            aria-label="Sort menu"
            onAction={(email: Key) => {
              const exists = emails.findIndex(({ email: e }) => e === email) !== -1;

              if (exists) {
                setEmails((prev: EmailInput[]) => prev.filter(({ email: e }) => e !== email));
              } else {
                const selectedItem = searchResult.find(item => item.name === email);

                addEmail({ email: email.toString(), teamId: selectedItem?.type === 'group' ? selectedItem?.id : undefined, picture: selectedItem?.picture });
              }

              if (inputRef.current) {
                inputRef.current.value = '';
              }

              setShowResults(false);
            }}
          >
            {searchResult.map(item => (
              <UserItem
                id={item.name}
                key={item.name}
                textValue={item.name}
                isSelected={emails.findIndex(({ email: e }) => e === item.name) !== -1}
              >
                <img alt="" src={item.picture} className="h-6 w-6 rounded-full" />
                <span className="truncate">{item.name}</span>
              </UserItem>
            ))}
          </ListBox>
        </Popover>
      </div>
      {error && (
        <p className='text-red-500'>{error}</p>
      )}
    </div>
  );
};

const UserItem = (props: ListBoxItemProps & { children: React.ReactNode; isSelected: boolean }) => {
  return (
    <ListBoxItem
      {...props}
      className="group flex cursor-default select-none items-center gap-2 rounded px-1 py-1 outline-none"
    >
      <span className="group-selected:font-medium flex flex-1 items-center gap-3 truncate font-normal">
        {props.children}
      </span>
      {props.isSelected && <Icon icon="check" className="h-4 w-4 text-primary" />}
    </ListBoxItem>
  );
};

async function handleInvite({
  emails,
  groupIds,
  organizationId,
  role,
}: {
  emails: string[];
  groupIds?: string[];
  organizationId: string;
  role: Role;
  enterpriseId?: string;
}) {
  // console.log(groupIds);
  const result = await startInvite({
    emails,
    teamIds: groupIds ?? [],
    organizationId,
  });

  console.log({ result, role });
  return [] as string[];
  // if (groupIds?.length) {
  //   const res = await startAddingTeams({ groupIds, organizationId });
  //   console.log({ res });
  //   // const instructResults = await Promise.allSettled(groupIds.map(groupId => startLinkingOrg({
  //   //   organizationId,
  //   //   enterpriseId,
  //   //   groupId,
  //   // })));

  //   // if (instructResults.find(({ status }) => status === 'rejected')) {
  //   //   throw new Error(
  //   //     (instructResults.filter(({ status }) => status === 'rejected') as { reason: Error }[])
  //   //       .map(({ reason: { message } }) => message)
  //   //       .join('\n')
  //   //   );
  //   // }

  //   // const resultMap = new Map<string, { groupMemberKeys: GroupMemberKey[]; errors: string[] }>();

  //   // const accountSet = new Set<string>();

  //   // for (const gInstruction of instructResults.filter(item => Boolean(item))) {
  //   //   if (!gInstruction || gInstruction.status === 'rejected') {
  //   //     continue;
  //   //   }

  //   //   gInstruction.value.instruction.members.forEach(mem => {
  //   //     accountSet.add(mem.accountId);
  //   //   });

  //   //   // const result = await addGroupLinkToOrgWithPassphrase({
  //   //   //   encDriverKey: user?.encDriverKey,
  //   //   //   encPrivateKey: user?.encPrivateKey,
  //   //   //   saltEnc: user?.saltEnc,
  //   //   //   encSymmetricKey: user?.encSymmetricKey,
  //   //   //   instructions: gInstruction.instruction,
  //   //   //   passphrase,
  //   //   // });

  //   //   resultMap.set(gInstruction.value.groupId!, result);
  //   // }

  //   // const promiseMap = new Map();

  //   // data?.invites.forEach(async (invite: Invite) => {
  //   //   if (!accountSet.has(invite.inviteeId)) {
  //   //     const response = await fetch(`${window.ENV.INSOMNIA_API_URI}/v1/organizations/${organizationId}/invites`, {
  //   //       method: 'POST',
  //   //       credentials: 'include',
  //   //       body: JSON.stringify(invite),
  //   //     });

  //   //     promiseMap.set(invite.inviteeEmail?.toLowerCase(), response);
  //   //   }
  //   // });

  //   // if (data.memberKeys.length) {
  //   //   await fetch(`${process.env.INSOMNIA_API_URI}/v1/organizations/${organizationId}/reconcile-keys`, {
  //   //     method: 'POST',
  //   //     credentials: 'include',
  //   //     body: JSON.stringify({
  //   //       keys: data.memberKeys,
  //   //     }),
  //   //   });
  //   // }

  //   // const linkingRequests = Array.from(resultMap.entries()).map(async ([key, value]) => {
  //   //   if (value) {
  //   //     const response = await fetch(
  //   //       `${window.ENV.INSOMNIA_API_URI}/v1/enterprise/${enterpriseId}/teams/${key}/finish-org-linking`,
  //   //       {
  //   //         credentials: 'include',
  //   //         method: 'post',
  //   //         body: JSON.stringify({ organizationIds: [organizationId], keys: value.groupMemberKeys }),
  //   //       },
  //   //     );

  //   //     if (response.ok) {
  //   //       return false;
  //   //     }

  //   //     return true;
  //   //   }
  //   // });

  //   // let success = false;
  //   // const linkingResponses = await Promise.all(linkingRequests);
  //   // linkingResponses.forEach((result) => {
  //   //   if (result != undefined) {
  //   //     success = result;
  //   //   }
  //   // });
  //   return [];
  // }

  // const { isAllowed } = await checkIfAllowToInvite({ organizationId, emails });

  // if (!isAllowed) {
  //   throw new Error(needToIncreaseSeatErrMsg);
  // }

  // const instructResults = await Promise.allSettled(emails.map(email => getInviteInstruction({
  //   organizationId,
  //   inviteeEmail: email.toLowerCase(),
  // })));

  // if (instructResults.find(({ status }) => status === 'rejected')) {
  //   throw new Error(
  //     (instructResults.filter(({ status }) => status === 'rejected') as { reason: Error }[])
  //       .map(({ reason: { message } }) => message)
  //       .join('\n')
  //   );
  // }

  // const instructions = (instructResults as PromiseFulfilledResult<InviteInstruction>[]).map(({ value }) => value);

  // const { invites, memberKeys } = await genInvitesAndMemberProjectKeys({
  //   instructions: instructions,
  //   organizationId,
  // });

  // if (invites.length > 0) {
  //   const inviteeEmails = await inviteAction({
  //     invites,
  //     memberKeys,
  //     organizationId,
  //   });

  //   if (role.name !== defaultRoleName) {
  //     await searchInvitesByInviteeEmailAndChangeRole(inviteeEmails, role.id, organizationId);
  //   }
  //   return inviteeEmails;
  // } else {
  //   throw new Error('Invites length is 0');
  // }
}

interface CheckIfAllowToInviteResponse {
  isAllowed: boolean;
}

// async function checkIfAllowToInvite(
//   { organizationId, emails }: { organizationId: string; emails: string[] },
// ): Promise<CheckIfAllowToInviteResponse> {
//   return insomniaFetch<CheckIfAllowToInviteResponse>({
//     method: 'POST',
//     path: `/v1/organizations/${organizationId}/check-seats`,
//     data: { emails },
//     sessionId: await getCurrentSessionId(),
//     onlyResolveOnSuccess: true,
//   }).catch(() => {
//     throw new Error('Failed to fetch available seats');
//   });
// }

interface InviteInstructionRequestOptions {
  organizationId: string;
  inviteeEmail: string;
}

interface InviteInstruction {
  inviteKeys: InviteKey[];
  inviteeId: string;
  inviteeEmail: string;
  inviteePublicKey: string;
  inviteeAutoLinked: boolean;
}

interface InviteKey {
  projectId: string;
  encSymmetricKey: string;
  autoLinked: boolean;
}

// const NEEDS_TO_UPGRADE_ERROR = 'NEEDS_TO_UPGRADE';
// const NEEDS_TO_INCREASE_SEATS_ERROR = 'NEEDS_TO_INCREASE_SEATS';

// async function getInviteInstruction(
//   {
//     organizationId,
//     inviteeEmail,
//   }: InviteInstructionRequestOptions
// ): Promise<InviteInstruction> {
//   return insomniaFetch<InviteInstruction>({
//     method: 'POST',
//     path: `/v1/organizations/${organizationId}/invites/instructions`,
//     data: { inviteeEmail },
//     sessionId: await getCurrentSessionId(),
//     onlyResolveOnSuccess: true,
//   }).catch(async error => {
//     if (error instanceof ResponseFailError && error.response.headers.get('content-type')?.includes('application/json')) {
//       let json;
//       try {
//         json = await error.response.json();
//       } catch (e) {
//         throw new Error(`Failed to get invite instruction for ${inviteeEmail}`);
//       }
//       if (json?.error === NEEDS_TO_UPGRADE_ERROR) {
//         throw new Error(
//           `You are currently on the Free plan where you can invite as many collaborators as you want only as long as
// you don’t have more than one project. Since you have more than one project, you need to upgrade to
// Individual or above to continue.`
//         );
//       }
//       if (json?.error === NEEDS_TO_INCREASE_SEATS_ERROR) {
//         throw new Error(needToIncreaseSeatErrMsg);
//       }
//       if (json?.message) {
//         throw new Error(json.message);
//       }
//     }
//     throw new Error(`Failed to get invite instruction for ${inviteeEmail}`);
//   });
// }

interface Invite {
  inviteeEmail: string;
  inviteKeys: InviteKey[];
  inviteeId: string;
}

interface MemberProjectKey {
  accountId: string;
  projectId: string;
  encSymmetricKey: string;
}

interface ProjectKey {
  projectId: string;
  encKey: string;
}

interface ProjectMember {
  accountId: string;
  projectId: string;
  publicKey: string;
}

interface ResponseGetMyProjectKeys {
  projectKeys: ProjectKey[];
  members: ProjectMember[];
}

interface EncryptedProjectKey {
  projectId: string;
  encKey: string;
}
interface DecryptedProjectKey {
  projectId: string;
  symmetricKey: string;
}

async function decryptProjectKeys(
  decryptionKey: JsonWebKey,
  projectKeys: EncryptedProjectKey[],
): Promise<DecryptedProjectKey[]> {
  try {
    const promises = projectKeys.map(key => {
      const symmetricKey = decryptRSAWithJWK(decryptionKey, key.encKey);
      return {
        projectId: key.projectId,
        symmetricKey,
      };
    });

    const decrypted = await Promise.all(promises);
    return decrypted;
  } catch (error) {
    throw error;
  }
}

function buildInviteByInstruction(
  instruction: InviteInstruction,
  rawProjectKeys: DecryptedProjectKey[],
): Invite {
  let inviteKeys: InviteKey[] = [];
  if (rawProjectKeys?.length) {
    const inviteePublicKey = JSON.parse(instruction.inviteePublicKey);
    inviteKeys = rawProjectKeys.map(key => {
      const reEncryptedSymmetricKey = encryptRSAWithJWK(inviteePublicKey, key.symmetricKey);
      return {
        projectId: key.projectId,
        encSymmetricKey: reEncryptedSymmetricKey,
        autoLinked: instruction.inviteeAutoLinked,
      };
    });
  }
  return {
    inviteeId: instruction.inviteeId,
    inviteeEmail: instruction.inviteeEmail,
    inviteKeys,
  };
}

function buildMemberProjectKey(
  accountId: string,
  projectId: string,
  publicKey: string,
  rawProjectKey?: string,
): MemberProjectKey | null {
  if (!rawProjectKey) {
    return null;
  }
  const acctPublicKey = JSON.parse(publicKey);
  const encSymmetricKey = encryptRSAWithJWK(acctPublicKey, rawProjectKey);
  return {
    projectId,
    accountId,
    encSymmetricKey,
  };
}

// interface GroupMemberInstruction {
//   accountId: string;
//   email: string;
//   publicKey: string;
// };

// interface GroupInviteKey {
//   projectId: string;
//   organizationId: string;
//   encKey: string;
// };

// interface GroupInstruction {
//   encryptionRequired: boolean;
//   members: GroupMemberInstruction[];
//   keys: GroupInviteKey[];
// };

export interface GroupMemberKey {
  accountId: string;
  organizationId: string;
  projectId: string;
  encKey: string;
};

// async function startLinkingOrg({
//   organizationId,
//   enterpriseId,
//   groupId,
// }: {
//   organizationId: string;
//   enterpriseId?: string;
//   groupId?: string;
// }) {
//   const instruction = await insomniaFetch<GroupInstruction>({
//     method: 'POST',
//     path: `/v1/enterprise/${enterpriseId}/teams/${groupId}/start-org-linking`,
//     data: { organizationId },
//     sessionId: await getCurrentSessionId(),
//     onlyResolveOnSuccess: true,
//   });

//   return { groupId, instruction };
// }

async function genInvitesAndMemberProjectKeys({
  instructions,
  organizationId,
}: {
  instructions: InviteInstruction[];
  organizationId: string;
}) {
  let invites: Invite[] = [];
  let memberKeys: MemberProjectKey[] = [];

  const projectKeysData = await insomniaFetch<ResponseGetMyProjectKeys>({
    method: 'GET',
    path: `/v1/organizations/${organizationId}/my-project-keys`,
    sessionId: await getCurrentSessionId(),
    onlyResolveOnSuccess: true,
  });

  try {
    const projectKeys = await decryptProjectKeys(await getPrivateKey(), projectKeysData.projectKeys || []);
    invites = instructions.map(instruction => buildInviteByInstruction(instruction, projectKeys));

    if (projectKeysData.members?.length) {
      const keyMap = projectKeys.reduce((keyMap: Record<string, string>, key: DecryptedProjectKey) => {
        keyMap[key.projectId] = key.symmetricKey;
        return keyMap;
      }, {});

      memberKeys = projectKeysData.members
        .map((member: ProjectMember) =>
          buildMemberProjectKey(member.accountId, member.projectId, member.publicKey, keyMap[member.projectId]),
        )
        .filter(Boolean) as MemberProjectKey[];
    }
  } catch (err: any) {
    throw new Error(`Error in genInvitesAndMemberProjectKeys: ${err.message}`);
  }

  return { invites, memberKeys };
}

type StartAddingTeamsResponse = Record<string, {
  accountId: string;
  publicKey: string;
}>;

async function startAddingTeams({
  groupIds,
  organizationId,
}: {
  groupIds: string[];
  organizationId: string;
}): Promise<StartAddingTeamsResponse> {
  // let invites: Invite[] = [];
  // let memberKeys: MemberProjectKey[] = [];

  const response = await insomniaFetch<StartAddingTeamsResponse>({
    method: 'POST',
    path: `/v1/desktop/organizations/${organizationId}/collaborators/start-adding-teams`,
    data: { teamIds: groupIds },
    sessionId: await getCurrentSessionId(),
    onlyResolveOnSuccess: true,
  });

  return response;
  // try {

  //   // const projectKeys = await decryptProjectKeys(await getPrivateKey(), projectKeysData.projectKeys || []);
  //   // invites = instructions.map(instruction => buildInviteByInstruction(instruction, projectKeys));

  //   // if (projectKeysData.members?.length) {
  //   //   const keyMap = projectKeys.reduce((keyMap: Record<string, string>, key: DecryptedProjectKey) => {
  //   //     keyMap[key.projectId] = key.symmetricKey;
  //   //     return keyMap;
  //   //   }, {});

  //   //   memberKeys = projectKeysData.members
  //   //     .map((member: ProjectMember) =>
  //   //       buildMemberProjectKey(member.accountId, member.projectId, member.publicKey, keyMap[member.projectId]),
  //   //     )
  //   //     .filter(Boolean) as MemberProjectKey[];
  //   // }
  // } catch (err: any) {
  //   throw new Error(`Error in genInvitesAndMemberProjectKeys: ${err.message}`);
  // }

  // return { invites, memberKeys };
}

async function inviteAction({
  invites,
  memberKeys,
  organizationId,
}: {
  invites: Invite[];
  memberKeys: MemberProjectKey[];
  organizationId: string;
}) {

  const inviteResults = await Promise.allSettled(
    invites.map(invite => inviteUserToOrganization({ organizationId, ...invite }))
  );

  if (inviteResults.find(({ status }) => status === 'rejected')) {
    throw new Error(
      (inviteResults.filter(({ status }) => status === 'rejected') as { reason: Error }[])
        .map(({ reason: { message } }) => message)
        .join('\n')
    );
  }

  const inviteeEmails = (inviteResults as PromiseFulfilledResult<string>[]).map(({ value: inviteeEmail }) => inviteeEmail);

  if (memberKeys.length) {
    await ensureProjectMemberKeys({ organizationId, memberKeys });
  }

  return inviteeEmails;
}

interface BaseOrganizationRequestOption {
  organizationId: string;
};

type InviteUserToOrganizationOptions = BaseOrganizationRequestOption & Invite;

// Invite a user to an organization
async function inviteUserToOrganization(
  options: InviteUserToOrganizationOptions,
) {
  const { organizationId: id, inviteKeys, inviteeId, inviteeEmail } = options;

  return insomniaFetch({
    method: 'POST',
    path: `/v1/organizations/${id}/invites`,
    sessionId: await getCurrentSessionId(),
    data: { inviteeId, inviteKeys, inviteeEmail },
    onlyResolveOnSuccess: true,
  }).then(
    () => inviteeEmail,
    async error => {
      let errMsg = `Failed to invite ${inviteeEmail}`;
      if (error instanceof ResponseFailError && error.message) {
        errMsg = error.message;
      }
      throw new Error(errMsg);
    }
  );
}

async function ensureProjectMemberKeys(
  options: {
    organizationId: string;
    memberKeys: MemberProjectKey[];
  },
) {
  return insomniaFetch({
    method: 'POST',
    path: `/v1/organizations/${options.organizationId}/reconcile-keys`,
    sessionId: await getCurrentSessionId(),
    data: {
      keys: options.memberKeys,
    },
    onlyResolveOnSuccess: true,
  });
}

const needToIncreaseSeatErrMsg = 'Seat count is not enough for new collaborators, please increase your seats and try again.';

/** search invites by invitee emails and then change these invites' role */
async function searchInvitesByInviteeEmailAndChangeRole(
  inviteeEmails: string[],
  roleId: string,
  organizationId: string,
) {
  try {
    let { invitations } = await insomniaFetch<{ invitations: PendingMember[] }>({
      method: 'GET',
      path: `/v1/organizations/${organizationId}/invites`,
      sessionId: await getCurrentSessionId(),
      onlyResolveOnSuccess: true,
    });
    invitations = invitations.filter(invitation => inviteeEmails.includes(invitation.invitee.email));
    await Promise.allSettled(invitations.map(({ id: invitationId }) => updateInvitationRole(
      roleId,
      invitationId,
      organizationId,
    )));
  } catch (error) { }
}

export async function updateInvitationRole(roleId: string, invitationId: string, organizationId: string) {
  return insomniaFetch({
    method: 'PATCH',
    path: `/v1/organizations/${organizationId}/invites/${invitationId}`,
    data: { roles: [roleId] },
    sessionId: await getCurrentSessionId(),
    onlyResolveOnSuccess: true,
  }).catch(() => {
    throw new Error('Failed to update organization member roles');
  });
}
