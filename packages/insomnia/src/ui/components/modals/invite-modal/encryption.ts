import { decryptRSAWithJWK, encryptRSAWithJWK } from '../../../../account/crypt';
import { getCurrentSessionId, getPrivateKey } from '../../../../account/session';
import { insomniaFetch } from '../../../insomniaFetch';

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

interface Invite {
  inviteeEmail: string;
  inviteKeys: InviteKey[];
  inviteeId: string;
}

export function buildInviteByInstruction(
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

interface EncryptedProjectKey {
  projectId: string;
  encKey: string;
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

type StartAddingTeamsResponse = Record<string, {
  accountId: string;
  publicKey: string;
}>;

async function startAddingTeams({
  teamIds,
  organizationId,
}: {
  teamIds: string[];
  organizationId: string;
}): Promise<StartAddingTeamsResponse> {
  const response = await insomniaFetch<StartAddingTeamsResponse>({
    method: 'POST',
    path: `/v1/desktop/organizations/${organizationId}/collaborators/start-adding-teams`,
    data: { teamIds },
    sessionId: await getCurrentSessionId(),
    onlyResolveOnSuccess: true,
  });

  return response;
}
type TeamProjectKey = {
  accountId: string;
} & ProjectKey;

async function finishAddingTeams({
  teamIds,
  organizationId,
  keys,
}: {
  teamIds: string[];
  organizationId: string;
  keys: Record<string, Record<string, TeamProjectKey>>;
}): Promise<void> {
  const response = await insomniaFetch<void>({
    method: 'POST',
    path: `/v1/desktop/organizations/${organizationId}/collaborators/finish-adding-teams`,
    data: { teamIds, keys },
    sessionId: await getCurrentSessionId(),
    onlyResolveOnSuccess: true,
  });

  return response;
}

interface StartInviteParams {
  teamIds: string[];
  organizationId: string;
  emails: string[];
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

interface DecryptedProjectKey {
  projectId: string;
  symmetricKey: string;
}

interface MemberProjectKey {
  accountId: string;
  projectId: string;
  encSymmetricKey: string;
}

export async function startInvite({ emails, teamIds, organizationId }: StartInviteParams) {
  // TODO: do some validations
  // 1. email length
  // 2. teamids length
  if (!teamIds.length) {
    return;
  }
  console.log('emails', emails);
  //   const memberKeys: MemberProjectKey[] = [];
  const keyMap = {};
  let teamKeyMap: StartAddingTeamsResponse;
  // get the project keys for this org
  const projectKeysData = await insomniaFetch<ResponseGetMyProjectKeys>({
    method: 'GET',
    path: `/v1/organizations/${organizationId}/my-project-keys`,
    sessionId: await getCurrentSessionId(),
    onlyResolveOnSuccess: true,
  });

  // TODO: wrap it inside the try catch
  const projectKeys = await decryptProjectKeys(await getPrivateKey(), projectKeysData.projectKeys || []);
  if (projectKeysData.members?.length) {
    projectKeys.reduce((keyMap: Record<string, string>, key: DecryptedProjectKey) => {
      keyMap[key.projectId] = key.symmetricKey;
      return keyMap;
    }, keyMap);

    // This is to reconcile any users in bad standing
    // memberKeys = projectKeysData.members
    //   .map((member: ProjectMember) =>
    //     buildMemberProjectKey(member.accountId, member.projectId, member.publicKey, keyMap[member.projectId]),
    //   )
    //   .filter(Boolean) as MemberProjectKey[];
  }

  if (teamIds.length > 0) {
    const teamKeys: Record<string, Record<string, TeamProjectKey>> = {};
    teamKeyMap = await startAddingTeams({ teamIds, organizationId });

    // Object.keys(teamKeyMap).forEach(acctId => {

    // });
    for (const [acctId, acctKey] of Object.entries(teamKeyMap)) {
      projectKeys.forEach(projKey => {
        const teamMemberProjectKey = buildMemberProjectKey(acctId, projKey.projectId, acctKey.publicKey, projKey.symmetricKey);
        if (!teamMemberProjectKey) {
          // throw error
          return;
        }

        if (!teamKeys[acctId]) {
          teamKeys[acctId] = {};
        }
        teamKeys[acctId][teamMemberProjectKey.projectId] = {
          accountId: teamMemberProjectKey.accountId,
          projectId: teamMemberProjectKey.projectId,
          encKey: teamMemberProjectKey.encSymmetricKey,
        };
      });
    }

    await finishAddingTeams({ teamIds, keys: teamKeys, organizationId });
  }
}
