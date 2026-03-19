import { BadRequestException, Injectable } from "@nestjs/common";

type XMentionTimelineResponse = {
  data?: Array<{
    id: string;
    text: string;
    author_id?: string;
    created_at?: string;
    referenced_tweets?: Array<{
      type: string;
      id: string;
    }>;
  }>;
  includes?: {
    users?: Array<{
      id: string;
      username?: string;
    }>;
  };
  meta?: {
    next_token?: string;
    newest_id?: string;
    oldest_id?: string;
    result_count?: number;
  };
};

type XUserListResponse = {
  data?: Array<{
    id: string;
    username?: string;
    name?: string;
  }>;
};

export class XApiRateLimitError extends BadRequestException {
  constructor(
    public readonly retryAfterSeconds: number | null,
    message = "X API rate limited",
  ) {
    super(message);
  }
}

type XCreatePostResponse = {
  data?: {
    id: string;
    text: string;
  };
};

type XPostLookupResponse = {
  data?: Array<{
    id: string;
    public_metrics?: {
      like_count?: number;
      reply_count?: number;
      repost_count?: number;
      quote_count?: number;
      impression_count?: number;
      bookmark_count?: number;
    };
  }>;
};

type XUserLookupResponse = {
  data?: {
    id: string;
    username?: string;
    name?: string;
    public_metrics?: {
      followers_count?: number;
      following_count?: number;
      tweet_count?: number;
      listed_count?: number;
    };
  };
};

type XUserPostsResponse = {
  data?: Array<{
    id: string;
    text: string;
    created_at?: string;
    public_metrics?: {
      like_count?: number;
      reply_count?: number;
      repost_count?: number;
      quote_count?: number;
      impression_count?: number;
      bookmark_count?: number;
    };
  }>;
};

@Injectable()
export class XApiService {
  async getMentions(params: {
    xUserId: string;
    accessToken: string;
    sinceId?: string;
    paginationToken?: string;
    maxResults?: number;
  }) {
    const url = new URL(`https://api.x.com/2/users/${params.xUserId}/mentions`);
    url.searchParams.set("max_results", String(params.maxResults ?? 25));
    url.searchParams.set("tweet.fields", "author_id,created_at,referenced_tweets");
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "username");
    if (params.sinceId) {
      url.searchParams.set("since_id", params.sinceId);
    }
    if (params.paginationToken) {
      url.searchParams.set("pagination_token", params.paginationToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      throw new XApiRateLimitError(retryAfter ? Number(retryAfter) : null, "Fetching mentions rate limited");
    }
    if (!response.ok) {
      throw new BadRequestException(`Fetching mentions failed with status ${response.status}`);
    }

    return (await response.json()) as XMentionTimelineResponse;
  }

  async createPost(params: {
    accessToken: string;
    text: string;
    inReplyToPostId?: string | null;
  }) {
    const body: Record<string, unknown> = {
      text: params.text,
    };

    if (params.inReplyToPostId) {
      body.reply = {
        in_reply_to_tweet_id: params.inReplyToPostId,
        auto_populate_reply_metadata: true,
      };
    }

    const response = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new BadRequestException(`Creating post failed with status ${response.status}`);
    }

    const json = (await response.json()) as XCreatePostResponse;
    if (!json.data?.id) {
      throw new BadRequestException("X did not return a post id");
    }

    return json.data;
  }

  async getPostsByIds(params: { accessToken: string; ids: string[] }) {
    if (params.ids.length === 0) {
      return { data: [] } satisfies XPostLookupResponse;
    }

    const url = new URL("https://api.x.com/2/tweets");
    url.searchParams.set("ids", params.ids.join(","));
    url.searchParams.set("tweet.fields", "public_metrics");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(`Fetching posts failed with status ${response.status}`);
    }

    return (await response.json()) as XPostLookupResponse;
  }

  async getUserById(params: { accessToken: string; xUserId: string }) {
    const url = new URL(`https://api.x.com/2/users/${params.xUserId}`);
    url.searchParams.set("user.fields", "public_metrics");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(`Fetching user metrics failed with status ${response.status}`);
    }

    return (await response.json()) as XUserLookupResponse;
  }

  async getUserByUsername(params: { accessToken: string; username: string }) {
    const username = params.username.replace(/^@/, "").trim();
    const url = new URL(`https://api.x.com/2/users/by/username/${username}`);
    url.searchParams.set("user.fields", "public_metrics");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(`Fetching user by username failed with status ${response.status}`);
    }

    return (await response.json()) as XUserLookupResponse;
  }

  async getUserPosts(params: {
    accessToken: string;
    xUserId: string;
    maxResults?: number;
  }) {
    const url = new URL(`https://api.x.com/2/users/${params.xUserId}/tweets`);
    url.searchParams.set("max_results", String(params.maxResults ?? 20));
    url.searchParams.set("exclude", "retweets,replies");
    url.searchParams.set("tweet.fields", "created_at,public_metrics");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(`Fetching user posts failed with status ${response.status}`);
    }

    return (await response.json()) as XUserPostsResponse;
  }

  async getLikingUsers(params: { accessToken: string; postId: string }) {
    const url = new URL(`https://api.x.com/2/tweets/${params.postId}/liking_users`);
    url.searchParams.set("max_results", "100");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(`Fetching liking users failed with status ${response.status}`);
    }

    return (await response.json()) as XUserListResponse;
  }

  async getRetweetedBy(params: { accessToken: string; postId: string }) {
    const url = new URL(`https://api.x.com/2/tweets/${params.postId}/retweeted_by`);
    url.searchParams.set("max_results", "100");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(`Fetching retweeted_by failed with status ${response.status}`);
    }

    return (await response.json()) as XUserListResponse;
  }

  async getFollowingUsers(params: { accessToken: string; xUserId: string }) {
    const url = new URL(`https://api.x.com/2/users/${params.xUserId}/following`);
    url.searchParams.set("max_results", "1000");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      throw new XApiRateLimitError(retryAfter ? Number(retryAfter) : null, "Fetching following users rate limited");
    }
    if (!response.ok) {
      throw new BadRequestException(`Fetching following users failed with status ${response.status}`);
    }

    return (await response.json()) as XUserListResponse;
  }
}
