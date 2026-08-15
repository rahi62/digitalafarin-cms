export type CmsBlock={id?:string;type:string;data:Record<string,unknown>};
export type CmsSeo={title:string;description:string;canonical_url:string;robots_index:boolean;robots_follow:boolean;og_title:string;og_description:string;og_image:string;twitter_card:string;focus_keyword?:string;secondary_keywords?:string[];seo_score?:number};
export type CmsSchema={id:string;schema_type:string;data:Record<string,unknown>;is_active:boolean};
export type CmsEntry={id:string;title:string;slug:string;path:string;excerpt:string;status:string;blocks:CmsBlock[];custom_fields:Record<string,unknown>;content_type_slug:string;published_at:string|null;updated_at:string};
export type ResolvedPage={preview?:boolean;site:{name:string;domain:string;language:string};content:CmsEntry;blocks:CmsBlock[];seo:CmsSeo|null;schemas:CmsSchema[];breadcrumbs:{title:string;path:string}[];related_content:{id:string;title:string;path:string;excerpt:string}[]};
