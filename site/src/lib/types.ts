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
  middle?: string | null;
  last: string;
  nickname?: string | null;
  suffix?: string | null;
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
  /** Party letter the unity figures are scored against (caucus for Independents, ADR 0005). */
  scoring_party: string | null;
  party_unity_pct: number | null;
  party_unity_cq_pct: number | null;
}

export interface MemberBio {
  birthday: string | null;
  age: number | null;
  gender: string | null;
}

export interface TermHistoryItem {
  term_index: number;
  chamber: 'house' | 'senate';
  congress: number;
  end_congress: number;
  start_date: string;
  end_date: string;
  state: string;
  district: number | null;
  senate_class: number | null;
  party: string | null;
  caucus: string | null;
  how: string | null;
  end_type: string | null;
}

export interface ServiceRecord {
  first_term_start: string;
  serving_since: string;
  term_number: number;
  chamber_since: string;
  chamber_term_number: number;
  terms: TermHistoryItem[];
}

export interface LeadershipRole {
  title: string;
  chamber: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
}

export interface MemberIds {
  govtrack: number | null;
  icpsr: number | null;
  fec: string[];
  lis: string | null;
  opensecrets: string | null;
  wikipedia: string | null;
  ballotpedia: string | null;
  cspan: number | null;
  votesmart: number | null;
  wikidata: string | null;
}

export interface MemberDetail {
  bioguide_id: string;
  name: MemberName;
  party: string | null;
  /** For Independents, the party they caucus with ("Democrat" / "Republican"). */
  caucus: string | null;
  seat: Seat;
  term: TermSpan;
  bio: MemberBio;
  service: ServiceRecord;
  leadership: LeadershipRole[];
  photo_url: string | null;
  ids: MemberIds;
  votes: VoteStats;
  activity: {
    bills_sponsored: number;
    bills_cosponsored: number;
    committees: number;
    chairmanships: number;
  };
  sources: SourceRef[];
}

export interface MemberListItem {
  bioguide_id: string;
  name: MemberName;
  party: string | null;
  caucus: string | null;
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
  congress: number;
  event_at: string;
  event_date: string;
  headline: string;
  detail: string | null;
  detail_full: string | null;
  position: string | null;
  chamber: string | null;
  session: number | null;
  roll_number: number | null;
  bill_type: string | null;
  bill_number: string | null;
  /** Human bill form when the bill has a detail page on this site, else null. */
  bill_label: string | null;
  /** Congress.gov policy area of the bill this event concerns; null for nomination votes,
   *  procedural roll calls, amendments, and bills the source has not classified. */
  policy_area: string | null;
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

export interface ContactResponse {
  bioguide_id: string;
  website_url: string | null;
  contact_form_url: string | null;
  phone: string | null;
  fax: string | null;
  office: string | null;
  address: string | null;
  rss_url: string | null;
  sources: SourceRef[];
}

export interface StatementItem {
  guid: string;
  title: string;
  published_at: string;
  published_date: string;
  url: string;
  author: string | null;
  categories: string[];
  description: string | null;
  content_html: string | null;
}

export interface StatementsResponse {
  bioguide_id: string;
  mode: 'feed' | 'link' | 'none';
  label: string | null;
  press_url: string | null;
  feed_url: string | null;
  total: number;
  newest_published_at: string | null;
  items: StatementItem[];
  sources: SourceRef[];
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

export type FundraisingStatus = 'filed' | 'no_filings' | 'no_committee' | 'no_candidate';

export interface ReceiptSource {
  amount: number;
  /** Share of total receipts, a mart column (never computed here). */
  pct: number | null;
}

export interface FundraisingResponse {
  bioguide_id: string;
  cycle: number;
  status: FundraisingStatus;
  candidate: { candidate_id: string; name: string | null; fec_url: string } | null;
  committee: { committee_id: string; name: string | null; fec_url: string } | null;
  coverage: {
    start_date: string;
    end_date: string;
    last_report_type: string | null;
    last_report_year: number | null;
  } | null;
  totals: { raised: number; spent: number; cash_on_hand: number; debts: number } | null;
  receipts: {
    individual_small: ReceiptSource;
    individual_large: ReceiptSource;
    individual: ReceiptSource;
    pac: ReceiptSource;
    party: ReceiptSource;
    self_funding: ReceiptSource;
    transfers: ReceiptSource;
    other: ReceiptSource;
  } | null;
  small_donor_pct: number | null;
  small_donor_of_individual_pct: number | null;
  sources: SourceRef[];
}

export interface BillSponsor {
  bioguide_id: string | null;
  name: string;
  full_name: string | null;
  party: string | null;
  state: string | null;
  district: number | null;
  is_tracked: boolean;
}

export interface CosponsorCounts {
  total: number;
  democratic: number;
  republican: number;
  other: number;
  withdrawn: number;
}

export interface BillListItem {
  congress: number;
  bill_type: string;
  bill_number: string;
  label: string;
  kind: string;
  title: string;
  policy_area: string | null;
  introduced_date: string;
  latest_action_date: string | null;
  latest_action_text: string | null;
  sponsor: BillSponsor;
  cosponsors: CosponsorCounts;
  action_count: number;
  summary_count: number;
  has_summary: boolean;
  roll_call_count: number;
  congress_gov_url: string;
}

export interface BillsResponse {
  items: BillListItem[];
  total: number;
  limit: number;
  offset: number;
  sources: SourceRef[];
}

export interface BillSummaryVersion {
  version_code: string;
  action_date: string;
  action_desc: string;
  text_html: string;
  text_length: number;
  update_date: string;
  is_latest: boolean;
}

export interface BillCosponsor {
  bioguide_id: string;
  name: string;
  full_name: string | null;
  party: string | null;
  state: string | null;
  district: number | null;
  date: string;
  is_original_cosponsor: boolean | null;
  withdrawn_date: string | null;
  is_withdrawn: boolean;
  is_tracked_member: boolean;
}

export interface BillAction {
  action_date: string;
  action_time: string | null;
  action_code: string | null;
  action_text: string | null;
  action_type: string | null;
  source_system: string | null;
}

export interface TrackedPosition {
  bioguide_id: string;
  name: string;
  party: string | null;
  position: string;
}

export interface BillRollCall {
  chamber: string;
  session: number;
  roll_number: number;
  voted_at: string | null;
  vote_date: string;
  question: string | null;
  result: string | null;
  yea_total: number;
  nay_total: number;
  present_total: number;
  not_voting_total: number;
  tracked_positions: TrackedPosition[];
  source_url: string;
}

export type JourneyStatus =
  | 'complete'
  | 'passed'
  | 'failed'
  | 'vetoed'
  | 'no_roll_call'
  | 'not_recorded'
  | 'pending';

export interface PartySplit {
  party: string;
  yea: number;
  nay: number;
  yea_pct: number | null;
  nay_pct: number | null;
}

export interface PassageVote {
  chamber: string;
  session: number;
  roll_number: number;
  vote_date: string;
  question: string | null;
  result: string | null;
  passed: boolean;
  majority_label: string | null;
  yea_total: number;
  nay_total: number;
  present_total: number;
  not_voting_total: number;
  yea_pct: number | null;
  nay_pct: number | null;
  parties: PartySplit[];
  source_url: string;
}

/** A stage of mart.bill_journey_stage, shown stages only, in order (ADR 0009). */
export interface JourneyStage {
  stage_key: string;
  label: string;
  order: number;
  status: JourneyStatus;
  status_label: string;
  date: string | null;
  detail: string | null;
  ends_journey: boolean;
  vote: PassageVote | null;
}

export interface BillDetail extends BillListItem {
  amended_bill_congress: number | null;
  amended_bill_type: string | null;
  amended_bill_number: string | null;
  update_date: string | null;
  summary: BillSummaryVersion | null;
  summary_versions: BillSummaryVersion[];
  cosponsor_list: BillCosponsor[];
  actions: BillAction[];
  roll_calls: BillRollCall[];
  journey: JourneyStage[];
  sources: SourceRef[];
}

export interface CongressSession {
  congress: number;
  session: number;
  year: number;
  start_date: string;
  end_date: string;
  first_roll_call_date: string;
  last_roll_call_date: string;
  roll_calls: number;
  is_current: boolean;
}

export interface SessionsResponse {
  sessions: CongressSession[];
  sources: SourceRef[];
}

/** GET /api/v1/congress/overview (api/schemas/congress.py). */
export interface PartyGroup {
  party_group: 'republican' | 'democratic' | 'independent' | 'vacant';
  label: string;
  seats: number;
  seat_pct: number;
  caucus_with: 'republican' | 'democratic' | null;
}

export interface ChamberComposition {
  chamber: 'house' | 'senate';
  seats: number;
  seated: number;
  vacant: number;
  majority_threshold: number;
  tiebreak_letter: string | null;
  majority_pct: number;
  republican_caucus: number;
  democratic_caucus: number;
  majority_party: string | null;
  majority_letter: 'R' | 'D' | null;
  majority_margin: number;
  groups: PartyGroup[];
  source_url: string;
}

export interface OverviewActivity {
  tracked_members: number;
  bills_in_dataset: number;
  bills_house: number;
  bills_senate: number;
  passed_chamber: number;
  passed_chamber_house_origin: number;
  passed_chamber_senate_origin: number;
  became_law: number;
  became_law_pct: number | null;
  vetoed: number;
  vetoed_overridden: number;
  vetoed_not_overridden: number;
}

export interface PassedBothItem {
  congress: number;
  bill_type: string;
  bill_number: string;
  label: string;
  title: string | null;
  outcome: 'law' | 'vetoed' | 'overridden' | 'adopted' | 'pending' | null;
  public_law_number: string | null;
  outcome_date: string | null;
  house_yea: number | null;
  house_nay: number | null;
  senate_yea: number | null;
  senate_nay: number | null;
  congress_gov_url: string;
}

export interface CongressOverviewResponse {
  congress: number;
  congress_start: string;
  congress_end: string;
  composition: {
    as_of: string;
    seats: number;
    seated: number;
    vacant: number;
    chambers: ChamberComposition[];
  };
  activity: OverviewActivity;
  passed_both: {
    total: number;
    enacted: number;
    adopted: number;
    vetoed: number;
    items: PassedBothItem[];
  };
  generated_at: string;
  sources: SourceRef[];
}
