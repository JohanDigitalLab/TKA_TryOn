// Explicitly invoked by a human with a real signed-in Supabase client.
// No CLI, environment reads, login, token fabrication, service-role, or automatic requests.
import { requireAdvanced, isUuid } from '../src/lib/school/advanced.mjs';

export async function verifySchoolAdvancedCapability({ authenticatedClient, anonymousClient, ownSchoolId, otherSchoolId }) {
 if (!isUuid(ownSchoolId) || !isUuid(otherSchoolId) || ownSchoolId === otherSchoolId) throw Error('Two distinct reviewed school IDs required');
 const user = await authenticatedClient.auth.getUser();
 if (user.error || !user.data?.user?.id || !user.data.user.email_confirmed_at) throw Error('Real verified authenticated session required');
 const own = await requireAdvanced(authenticatedClient, ownSchoolId);
 const other = await authenticatedClient.rpc('school_advanced_capabilities', { p_school_id: otherSchoolId });
 if (other.data || other.error?.code !== '42501') throw Error('Cross-school denial must be explicit 42501, not missing RPC or transport failure');
 const anon = await anonymousClient.auth.getSession();
 if (anon.error || anon.data?.session) throw Error('Anonymous client must have no session');
 const denied = await anonymousClient.rpc('school_advanced_capabilities', { p_school_id: ownSchoolId });
 if (denied.data || denied.error?.code !== '42501') throw Error('Anonymous denial must be explicit 42501');
 return { capabilityVersion: own.capability_version, checks: ['real-auth', 'own-school', 'cross-school-denied', 'anonymous-denied'], readOnly: true };
}
