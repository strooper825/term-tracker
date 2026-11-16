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

export interface MapCounty {
  geoid: string;
  name: string;
  d: string;
}

export interface MapView {
  key: 'district' | 'state';
  width: number;
  height: number;
  outline: string;
  counties: MapCounty[];
  /** State view only: the member's district in this view's frame. */
  district: string | null;
}

export interface Estimate {
  value: number | null;
  margin: number | null;
}

export type RaceKey =
  | 'white'
  | 'black'
  | 'native'
  | 'asian'
  | 'pacific'
  | 'other'
  | 'multiple'
  | 'hispanic';

export interface ConstituencyDemographics {
  acs_year: number;
  period: string;
  name: string;
  population: Estimate;
  median_age: Estimate;
  median_household_income: Estimate;
  households: Estimate;
  bachelors_or_higher_pct: Estimate;
  high_school_or_higher_pct: Estimate;
  unemployment_pct: Estimate;
  poverty_pct: Estimate;
  race: { key: RaceKey; pct: number | null }[];
}

export interface ConstituencyResponse {
  bioguide_id: string;
  chamber: 'house' | 'senate';
  label: string | null;
  congress: number | null;
  district: number | null;
  map: { views: MapView[] } | null;
  demographics: ConstituencyDemographics | null;
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
  /** What press_url is: the office's press listing, or only its official website. */
  link_kind: 'press_page' | 'official_website' | null;
  label: string | null;
  press_url: string | null;
  feed_url: string | null;
  total: number;
  newest_published_at: string | null;
  items: StatementItem[];
  sources: SourceRef[];
}

export interface StockTradeItem {
  doc_id: string;
  row_number: number;
  trade_date: string;
  /** House reports only; eFD has no notification date. */
  notification_date: string | null;
  filing_date: string;
  days_to_file: number;
  owner_code: string;
  owner_label: string;
  asset_name: string;
  ticker: string | null;
  asset_type_code: string;
  asset_type_label: string;
  transaction_type_code: string;
  transaction_type_label: string;
  direction: 'purchase' | 'sale' | 'exchange' | 'other';
  amount_raw: string;
  amount_kind: 'band' | 'top_band' | 'exact';
  amount_low: number;
  amount_high: number | null;
  filing_status: string | null;
  subholding_of: string | null;
  description: string | null;
  location: string | null;
  comments: string | null;
  has_unmapped_code: boolean;
  source_url: string;
}

export interface StockTradeFiling {
  doc_id: string;
  year: number;
  filing_date: string;
  status: 'parsed' | 'scanned' | 'failed';
  error: string | null;
  pages: number | null;
  /** Senate: 0 for an original, else the amendment number. House: null. */
  amendment: number | null;
  /** The Senate amendment that replaced this report; its trades are not listed. */
  superseded_by: string | null;
  trades: number;
  source: 'house_clerk_ptr' | 'senate_efd';
  source_url: string;
}

export interface StockTradesSummary {
  filings: number;
  filings_parsed: number;
  filings_scanned: number;
  filings_failed: number;
  latest_filing_date: string | null;
  trades: number;
  purchases: number;
  sales: number;
  exchanges: number;
  purchases_low: number;
  purchases_high: number;
  purchases_high_is_open: boolean;
  sales_low: number;
  sales_high: number;
  sales_high_is_open: boolean;
  first_trade_date: string | null;
  last_trade_date: string | null;
}

export interface AnnualDisclosureItem {
  doc_id: string;
  kind: 'annual' | 'amendment' | 'new_filer' | 'termination' | 'extension';
  /** As the site shows it: "Annual report for 2025", "Report for 2026: not filed yet". */
  label: string;
  covers_year: number | null;
  /** Filed; for kind extension, the day the extension was requested. */
  filing_date: string;
  /** An annual or new member report filed after an extension requested this day. */
  extended_on: string | null;
  source: 'house_clerk' | 'senate_efd';
  source_url: string;
}

export interface AnnualAsset {
  row_label: string;
  is_account: boolean;
  asset_name: string;
  asset_notes: string | null;
  asset_category: string | null;
  asset_subtype: string | null;
  owner_label: string;
  value_raw: string;
  value_kind: 'band' | 'none' | 'top_band' | 'not_valued' | 'unascertainable';
  value_low: number | null;
  value_high: number | null;
  income_type: string | null;
  income_raw: string | null;
}

export interface AnnualLiability {
  incurred: string | null;
  owner_label: string;
  liability_type: string;
  rate: string | null;
  amount_raw: string;
  amount_low: number | null;
  amount_high: number | null;
  creditor: string;
  comments: string | null;
}

export interface AnnualNetWorth {
  covers_year: number;
  doc_id: string;
  label: string;
  filing_date: string;
  holdings: number;
  unascertainable: number;
  assets_low: number;
  assets_high: number;
  assets_high_is_open: boolean;
  liabilities: number;
  liabilities_low: number;
  liabilities_high: number;
  liabilities_high_is_open: boolean;
  net_low: number | null;
  net_high: number | null;
  source_url: string;
  assets: AnnualAsset[];
  liabilities_list: AnnualLiability[];
}

export interface AnnualDisclosuresResponse {
  bioguide_id: string;
  chamber: 'house' | 'senate';
  status: 'filed' | 'no_filings' | 'unavailable';
  covers_from: string;
  lookup_url: string;
  checked_at: string | null;
  items: AnnualDisclosureItem[];
  /** What the newest read report adds up to (ADR 0028); null until one is read. */
  latest?: AnnualNetWorth | null;
  sources: SourceRef[];
}

export interface StockTradesResponse {
  bioguide_id: string;
  chamber: 'house' | 'senate';
  status: 'filed' | 'no_filings' | 'senate_unavailable';
  covers_from: string;
  lookup_url: string;
  checked_at: string | null;
  summary: StockTradesSummary;
  filings: StockTradeFiling[];
  items: StockTradeItem[];
  sources: SourceRef[];
}

export interface KeyDatesResponse {
  bioguide_id: string;
  items: KeyDate[];
  sources: SourceRef[];
}

export interface FreshnessResponse {
  generated_at: string;
  sources: {
    source: string;
    source_url: string | null;
    fetched_at: string;
    /** The source refused the newest nightly read, so fetched_at is the last time it could be
     *  read at all (ADR 0020). */
    unavailable?: boolean;
  }[];
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

/** GET /bills/index: every bill of the Congress, with or without a page (ADR 0025). */
export interface BillIndexItem {
  congress: number;
  bill_type: string;
  bill_number: string;
  label: string;
  kind: string;
  title: string;
  policy_area: string | null;
  origin_chamber: string;
  introduced_date: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
  sponsor_name: string | null;
  sponsor_party: string | null;
  sponsor_state: string | null;
  cosponsor_count: number;
  cosponsors_democratic: number;
  cosponsors_republican: number;
  /** 1 introduced, 2 reported, 3 passed one chamber, 4 passed both, 5 became law */
  stage: number;
  has_floor_vote: boolean;
  is_minor: boolean;
  has_page: boolean;
  congress_gov_url: string;
}

export interface BillIndexResponse {
  items: BillIndexItem[];
  total: number;
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
  /** Whether the bill has a page on the site; most bills of the Congress do not. */
  has_page: boolean;
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

/** GET /api/v1/congress/seats (api/schemas/congress.py): every occupied seat, tracked or not. */
export interface SeatHolder {
  seat_key: string;
  chamber: 'house' | 'senate';
  state: string;
  state_name: string | null;
  /** House only: 0 for an at-large seat and for a delegate. */
  district: number | null;
  senate_class: number | null;
  state_rank: string | null;
  bioguide_id: string;
  name: string;
  last_name: string;
  /** As congress-legislators writes it: Democrat, Republican, Independent. */
  party: string | null;
  caucus: string | null;
  is_tracked: boolean;
  photo_url: string;
  website_url: string | null;
}

export interface SeatsResponse {
  seats: SeatHolder[];
  generated_at: string;
  sources: SourceRef[];
}
