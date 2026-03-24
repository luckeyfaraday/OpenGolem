/**
 * Telegram Bot API Client
 * Handles communication with Telegram Bot API
 */

export class TelegramAPI {
  private baseUrl: string;

  constructor(botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * Get updates from Telegram (long polling)
   */
  async getUpdates(options: {
    offset?: number;
    limit?: number;
    timeout?: number;
    allowedUpdates?: string[];
  } = {}): Promise<any> {
    const url = `${this.baseUrl}/getUpdates`;
    const params = new URLSearchParams();

    if (options.offset !== undefined) params.append('offset', String(options.offset));
    if (options.limit !== undefined) params.append('limit', String(options.limit));
    if (options.timeout !== undefined) params.append('timeout', String(options.timeout));
    if (options.allowedUpdates) params.append('allowedUpdates', JSON.stringify(options.allowedUpdates));

    const response = await fetch(`${url}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Send a message
   */
  async sendMessage(params: {
    chat_id: number | string;
    text: string;
    parse_mode?: 'MarkdownV2' | 'HTML';
    disable_web_page_preview?: boolean;
    disable_notification?: boolean;
    reply_to_message_id?: number;
    reply_markup?: any;
  }): Promise<any> {
    const url = `${this.baseUrl}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Telegram sendMessage error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Edit a message
   */
  async editMessageText(params: {
    chat_id?: number | string;
    message_id?: number;
    inline_message_id?: string;
    text: string;
    parse_mode?: 'MarkdownV2' | 'HTML';
    disable_web_page_preview?: boolean;
    reply_markup?: any;
  }): Promise<any> {
    const url = `${this.baseUrl}/editMessageText`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Telegram editMessageText error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Answer a callback query (for inline buttons)
   */
  async answerCallbackQuery(params: {
    callback_query_id: string;
    text?: string;
    show_alert?: boolean;
    url?: string;
    cache_time?: number;
  }): Promise<any> {
    const url = `${this.baseUrl}/answerCallbackQuery`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Telegram answerCallbackQuery error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Send a photo
   */
  async sendPhoto(params: {
    chat_id: number | string;
    photo: string; // file_id, URL, or path
    caption?: string;
    parse_mode?: 'MarkdownV2' | 'HTML';
    disable_notification?: boolean;
    reply_to_message_id?: number;
    reply_markup?: any;
  }): Promise<any> {
    const url = `${this.baseUrl}/sendPhoto`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Telegram sendPhoto error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Send a document
   */
  async sendDocument(params: {
    chat_id: number | string;
    document: string; // file_id, URL, or path
    caption?: string;
    parse_mode?: 'MarkdownV2' | 'HTML';
    disable_notification?: boolean;
    reply_to_message_id?: number;
    reply_markup?: any;
  }): Promise<any> {
    const url = `${this.baseUrl}/sendDocument`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Telegram sendDocument error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Set webhook (optional, for webhook mode)
   */
  async setWebhook(params: {
    url: string;
    certificate?: string;
    ip_address?: string;
    max_connections?: number;
    allowed_updates?: string[];
  }): Promise<any> {
    const url = `${this.baseUrl}/setWebhook`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Telegram setWebhook error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(params: {
    drop_pending_updates?: boolean;
  } = {}): Promise<any> {
    const url = `${this.baseUrl}/deleteWebhook`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Telegram deleteWebhook error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get bot information
   */
  async getMe(): Promise<any> {
    const url = `${this.baseUrl}/getMe`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Telegram getMe error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}