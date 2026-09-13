/** Subset of the Phase 1d API responses the site reads (api/schemas/*.py). */

export interface SourceRef {
  source: string;
  source_url: string;
  fetched_at: string;
}

export interface Seat {
  chamber: 'house' | 'senate';
  state: string;
  state_name: string | null;
  fips_state: string | null;
  district: number | null;
  senate_class: number | null;
  state_rank: string | null;
  label: string;
}

export interface MemberName {
  first: string;
  last: string;
  official_full: string;
}

export interface TermSpan {
  congress: number;
  end_congress: number;
  congresses: number[];
  tracked_congress: number;
  start_date: string;
  end_date: string;
  days_remaining: number;
  days_elapsed: number;
}

export interface VoteStats {
  roll_calls: number | null;
  positions: number;
  votes_cast: number;
  not_voting: number;
  attendance_pct: number | null;
  missed_vote_pct: number | null;
  party_unity_pct: number | null;
  party_unity_cq_pct: number | null;
}

export interface MemberDetail {
  bioguide_id: string;
  name: MemberName;
  party: string | null;
  seat: Seat;
  term: TermSpan;
  photo_url: string | null;
  votes: VoteStats;
  activity: { bills_sponsored: number; bills_cosponsored: number; committees: number };
  sources: SourceRef[];
}

export interface MemberListItem {
  bioguide_id: string;
  name: MemberName;
  party: string | null;
  seat: Seat;
  photo_url: string | null;
}

export interface MembersResponse {
  members: MemberListItem[];
  sources: SourceRef[];
}

export interface WeekBucket {
  week_start: string;
  vote: number;
  bill_sponsored: number;
  bill_cosponsored: number;
  committee_action: number;
  total: number;
}

export interface TimelineResponse {
  bioguide_id: string;
  from: string;
  to: string;
  weeks: WeekBucket[];
  sources: SourceRef[];
}

export interface FeedItem {
  event_key: string;
  event_type: 'vote' | 'bill_sponsored' | 'bill_cosponsored' | 'committee_action';
  event_at: string;
  event_date: string;
  headline: string;
  detail: string | null;
  position: string | null;
  chamber: string | null;
  session: number | null;
  roll_number: number | null;
  bill_type: string | null;
  bill_number: string | null;
  url: string | null;
  source_url: string;
}

export interface FeedResponse {
  bioguide_id: string;
  items: FeedItem[];
  next_cursor: string | null;
  sources: SourceRef[];
}

export interface CommitteeAssignment {
  thomas_id: string;
  name: string;
  chamber: string;
  parent_thomas_id: string | null;
  parent_name: string | null;
  rank: number | null;
  title: string | null;
}

export interface CommitteesResponse {
  bioguide_id: string;
  items: CommitteeAssignment[];
  sources: SourceRef[];
}

export interface KeyDate {
  date: string;
  label: string;
  kind: string;
  scope: string;
  scope_value: string | null;
  note: string | null;
  source_url: string;
}

export interface KeyDatesResponse {
  bioguide_id: string;
  items: KeyDate[];
  sources: SourceRef[];
}

export interface FreshnessResponse {
  generated_at: string;
  sources: { source: string; source_url: string | null; fetched_at: string }[];
}
