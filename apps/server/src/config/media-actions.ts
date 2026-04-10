import { gatewayConfig } from './gateway';

export type MediaActionType = 'wx-work-post' | 'wechat-article' | 'notify-photographer';
export type MediaActionStatus =
  | 'QUEUED'
  | 'DISPATCHING'
  | 'DISPATCHED'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED';

export interface MediaActionFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea';
  required?: boolean;
  placeholder?: string;
}

export interface MediaActionDefinition {
  type: MediaActionType;
  label: string;
  description: string;
  fields: MediaActionFieldDefinition[];
}

export interface MediaActionGatewayConfig {
  url: string;
  toGatewayToken: string;
  fromGatewayToken: string;
  callbackBaseUrl: string;
  routePrefix: string;
}

export const MEDIA_ACTION_DEFINITIONS: MediaActionDefinition[] = [
  {
    type: 'wx-work-post',
    label: '发布到企业微信群',
    description: '把选中的图片和说明文字提交给企业微信外部服务。',
    fields: [
      {
        key: 'target',
        label: '目标群',
        type: 'text',
        required: true,
        placeholder: '如：摄影通知群',
      },
      {
        key: 'text',
        label: '附加说明',
        type: 'textarea',
        placeholder: '可填写随图片一起发送的说明',
      },
    ],
  },
  {
    type: 'wechat-article',
    label: '发布到公众号',
    description: '把选中的图片及表单数据提交给公众号外部服务。',
    fields: [
      { key: 'title', label: '标题', type: 'text', required: true, placeholder: '请输入文章标题' },
      { key: 'summary', label: '摘要', type: 'textarea', placeholder: '请输入摘要或备注' },
    ],
  },
  {
    type: 'notify-photographer',
    label: '通知摄影师拍摄',
    description: '把选中的参考图和需求说明提交给摄影师通知服务。',
    fields: [
      {
        key: 'target',
        label: '摄影师',
        type: 'text',
        required: true,
        placeholder: '请输入摄影师或群组名',
      },
      {
        key: 'requirement',
        label: '拍摄需求',
        type: 'textarea',
        required: true,
        placeholder: '请输入拍摄需求',
      },
    ],
  },
];

export function getMediaActionGatewayConfig(): MediaActionGatewayConfig {
  return {
    url: process.env.MEDIA_ACTION_GATEWAY_URL || gatewayConfig.url || '',
    toGatewayToken: process.env.MEDIA_ACTION_TO_GATEWAY_TOKEN || gatewayConfig.toGatewayToken || '',
    fromGatewayToken:
      process.env.MEDIA_ACTION_FROM_GATEWAY_TOKEN || gatewayConfig.fromGatewayToken || '',
    callbackBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    routePrefix: process.env.MEDIA_ACTION_GATEWAY_ROUTE_PREFIX || '/webhooks/cpp/media-actions',
  };
}
