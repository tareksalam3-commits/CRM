import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Badge, Button } from '../components/ui';
import type { Profile, OrganizationalHierarchy } from '../types/database';
import { ROLE_LABELS } from '../types/database';
import { Users, ChevronLeft, ChevronRight } from 'lucide-react';

interface OrgNode extends Profile {
  children: OrgNode[];
  parent_id?: string | null;
  level: number;
}

export default function OrganizationPage() {
  const [orgTree, setOrgTree] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    setLoading(true);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*, branch:branches(*)')
      .eq('is_active', true)
      .order('full_name');

    const { data: hierarchy } = await supabase
      .from('organizational_hierarchy')
      .select('*');

    if (profiles && hierarchy) {
      const hierarchyMap = new Map(hierarchy.map((h) => [h.user_id, h]));
      const profileMap = new Map(profiles.map((p) => [p.id, { ...p, children: [], level: hierarchyMap.get(p.id)?.level || 0, parent_id: hierarchyMap.get(p.id)?.parent_id || null }]));

      // Build tree
      const roots: OrgNode[] = [];
      profileMap.forEach((node) => {
        if (node.parent_id && profileMap.has(node.parent_id)) {
          profileMap.get(node.parent_id)!.children.push(node);
        } else {
          roots.push(node);
        }
      });

      setOrgTree(roots);
    }

    setLoading(false);
  };

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderNode = (node: OrgNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);

    const roleColors: Record<string, string> = {
      super_admin: 'bg-red-100 text-red-800 border-red-200',
      development_manager: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      general_supervisor: 'bg-green-100 text-green-800 border-green-200',
      supervisor: 'bg-blue-100 text-blue-800 border-blue-200',
      group_leader: 'bg-purple-100 text-purple-800 border-purple-200',
      agent: 'bg-gray-100 text-gray-800 border-gray-200',
    };

    return (
      <div key={node.id} className="mb-2">
        <div
          className={`flex items-center gap-3 p-3 rounded-lg border ${roleColors[node.role] || 'bg-gray-100'} cursor-pointer hover:shadow-sm transition-shadow`}
          style={{ marginRight: `${depth * 24}px` }}
          onClick={() => hasChildren && toggleNode(node.id)}
        >
          {hasChildren && (
            <div className="w-6 h-6 flex items-center justify-center">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </div>
          )}
          {!hasChildren && <div className="w-6" />}

          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-700 font-medium">
            {node.full_name.charAt(0)}
          </div>

          <div className="flex-1">
            <p className="font-medium">{node.full_name}</p>
            <p className="text-xs opacity-75">{ROLE_LABELS[node.role]}</p>
          </div>

          <Badge variant="info" size="sm">{node.branch?.name || 'بدون فرع'}</Badge>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  function ChevronDown({ className }: { className?: string }) {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الهيكل التنظيمي</h1>
          <p className="text-gray-500 mt-1">شجرة الهيكل الإداري والتنظيمي</p>
        </div>
        <Button variant="secondary" onClick={() => setExpandedNodes(new Set())}>
          طي الكل
        </Button>
      </div>

      <Card>
        <div className="space-y-2">
          {orgTree.map((node) => renderNode(node))}
        </div>
      </Card>
    </div>
  );
}
