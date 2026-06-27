import { supabase, type User, type UserRole } from './supabase';

/**
 * Get all user IDs that the current user can see based on hierarchy
 * This includes the user themselves and all subordinates
 */
export async function getAccessibleUserIds(user: User): Promise<string[]> {
  const userIds = [user.id];

  if (user.role === 'super_admin' || user.role === 'dev_manager') {
    // These roles see everyone
    const { data: allUsers } = await supabase.from('users').select('id');
    return allUsers?.map(u => u.id) || [user.id];
  }

  if (user.role === 'general_supervisor') {
    // See all supervisors under them
    const { data: supervisors } = await supabase
      .from('users')
      .select('id')
      .eq('manager_id', user.id);
    
    if (supervisors) {
      supervisors.forEach(s => userIds.push(s.id));
      
      // Also get group leaders and agents under these supervisors
      const supervisorIds = supervisors.map(s => s.id);
      const { data: groupLeaders } = await supabase
        .from('users')
        .select('id')
        .in('manager_id', supervisorIds);
      
      if (groupLeaders) {
        groupLeaders.forEach(gl => userIds.push(gl.id));
        
        // Get agents under group leaders
        const glIds = groupLeaders.map(gl => gl.id);
        const { data: agents } = await supabase
          .from('users')
          .select('id')
          .in('manager_id', glIds);
        
        if (agents) {
          agents.forEach(a => userIds.push(a.id));
        }
      }
    }
  }

  if (user.role === 'supervisor') {
    // See all group leaders and agents under them
    const { data: groupLeaders } = await supabase
      .from('users')
      .select('id')
      .eq('manager_id', user.id);
    
    if (groupLeaders) {
      groupLeaders.forEach(gl => userIds.push(gl.id));
      
      // Get agents under group leaders
      const glIds = groupLeaders.map(gl => gl.id);
      const { data: agents } = await supabase
        .from('users')
        .select('id')
        .in('manager_id', glIds);
      
      if (agents) {
        agents.forEach(a => userIds.push(a.id));
      }
    }
  }

  if (user.role === 'group_leader') {
    // See all agents under them
    const { data: agents } = await supabase
      .from('users')
      .select('id')
      .eq('manager_id', user.id);
    
    if (agents) {
      agents.forEach(a => userIds.push(a.id));
    }
  }

  // Agent only sees themselves
  return userIds;
}

/**
 * Build a Supabase filter string for accessing data based on user role and hierarchy
 */
export async function buildAccessFilter(user: User, fieldName: string): Promise<string | null> {
  const userIds = await getAccessibleUserIds(user);
  
  if (userIds.length === 0) return null;
  if (userIds.length === 1) return `${fieldName}.eq.${userIds[0]}`;
  
  return `${fieldName}.in.(${userIds.join(',')})`;
}

/**
 * Check if a user can access a specific resource
 */
export async function canAccessResource(user: User, resourceOwnerId: string): Promise<boolean> {
  const accessibleIds = await getAccessibleUserIds(user);
  return accessibleIds.includes(resourceOwnerId);
}

/**
 * Get all clients accessible to the user
 */
export async function getAccessibleClients(user: User) {
  const accessibleIds = await getAccessibleUserIds(user);
  
  if (accessibleIds.length === 0) {
    return { data: [], error: null };
  }

  return supabase
    .from('clients')
    .select('*')
    .in('agent_id', accessibleIds)
    .order('created_at', { ascending: false });
}

/**
 * Get all policies accessible to the user
 */
export async function getAccessiblePolicies(user: User) {
  const accessibleIds = await getAccessibleUserIds(user);
  
  if (accessibleIds.length === 0) {
    return { data: [], error: null };
  }

  return supabase
    .from('policies')
    .select('*')
    .in('agent_id', accessibleIds)
    .order('created_at', { ascending: false });
}

/**
 * Get all collections accessible to the user
 */
export async function getAccessibleCollections(user: User) {
  const accessibleIds = await getAccessibleUserIds(user);
  
  if (accessibleIds.length === 0) {
    return { data: [], error: null };
  }

  return supabase
    .from('collections')
    .select('*')
    .in('collector_id', accessibleIds)
    .order('collection_date', { ascending: false });
}

/**
 * Get all installments accessible to the user
 */
export async function getAccessibleInstallments(user: User) {
  const accessibleIds = await getAccessibleUserIds(user);
  
  if (accessibleIds.length === 0) {
    return { data: [], error: null };
  }

  // Get policies for accessible users first
  const { data: policies } = await supabase
    .from('policies')
    .select('id')
    .in('agent_id', accessibleIds);
  
  const policyIds = policies?.map(p => p.id) || [];
  
  if (policyIds.length === 0) {
    return { data: [], error: null };
  }

  return supabase
    .from('installments')
    .select('*')
    .in('policy_id', policyIds)
    .order('due_date', { ascending: true });
}
