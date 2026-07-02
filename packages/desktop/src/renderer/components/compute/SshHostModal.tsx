/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ComputeSshAuthType, ComputeSshHostInput, ComputeSshHostPublic } from '@/common/types/compute';
import { Button, Form, Input, Message, Modal, Select, Switch } from '@arco-design/web-react';
import { FolderOpen, Info } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './compute.module.css';

type FormValues = {
  name: string;
  host: string;
  port: number;
  username: string;
  authType: ComputeSshAuthType;
  password?: string;
  privateKeyPath?: string;
  privateKeyPassphrase?: string;
  remoteWorkdir?: string;
  tags?: string;
  notes?: string;
  exposeCredentialsToAgent?: boolean;
};

type SshHostModalProps = {
  visible: boolean;
  host?: ComputeSshHostPublic;
  onClose: () => void;
  onSaved?: (host: ComputeSshHostPublic) => void;
};

const toTagString = (tags?: string[]): string => (tags || []).join(', ');

const parseTags = (value?: string): string[] =>
  (value || '')
    .split(/[,，\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);

const SshHostModal: React.FC<SshHostModalProps> = ({ visible, host, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const authType = Form.useWatch('authType', form) || host?.authType || 'password';
  const isEditing = Boolean(host);

  const initialValues = useMemo<FormValues>(
    () => ({
      name: host?.name || '',
      host: host?.host || '',
      port: host?.port || 22,
      username: host?.username || '',
      authType: host?.authType || 'password',
      password: '',
      privateKeyPath: host?.privateKeyPath || '',
      privateKeyPassphrase: '',
      remoteWorkdir: host?.remoteWorkdir || '',
      tags: toTagString(host?.tags),
      notes: host?.notes || '',
      exposeCredentialsToAgent: host ? host.exposeCredentialsToAgent === true : true,
    }),
    [host]
  );

  useEffect(() => {
    if (visible) form.setFieldsValue(initialValues);
  }, [form, initialValues, visible]);

  const handlePickPrivateKey = useCallback(async () => {
    const selected = await ipcBridge.dialog.showOpen.invoke({
      properties: ['openFile'],
      title: t('settings.compute.pickPrivateKey', { defaultValue: '选择 private key 文件' }),
    });
    const first = selected?.[0];
    if (first) form.setFieldValue('privateKeyPath', first);
  }, [form, t]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validate();
      setSaving(true);
      const input: ComputeSshHostInput = {
        id: host?.id,
        name: values.name,
        host: values.host,
        port: Number(values.port || 22),
        username: values.username,
        authType: values.authType,
        password: values.password,
        privateKeyPath: values.privateKeyPath,
        privateKeyPassphrase: values.privateKeyPassphrase,
        remoteWorkdir: values.remoteWorkdir,
        tags: parseTags(values.tags),
        notes: values.notes,
        exposeCredentialsToAgent: values.exposeCredentialsToAgent === true,
      };
      const result = await ipcBridge.computeHosts.save.invoke({ input, testOnSave: true });
      onSaved?.(result.host);
      onClose();
      if (result.test.ok) {
        Message.success(t('settings.compute.saveAndTestSuccess', { defaultValue: '服务器已保存，SSH 连接测试通过' }));
      } else {
        Modal.warning({
          title: t('settings.compute.testFailedTitle', { defaultValue: '服务器已保存，但连接测试未通过' }),
          content: result.test.message,
          okText: t('common.confirm', { defaultValue: '知道了' }),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.compute.saveFailed', { defaultValue: '保存失败' });
      Message.error(message);
    } finally {
      setSaving(false);
    }
  }, [form, host?.id, onClose, onSaved, t]);

  return (
    <Modal
      className={styles.hostModal}
      visible={visible}
      title={
        isEditing
          ? t('settings.compute.editHost', { defaultValue: '编辑 SSH host' })
          : t('settings.compute.addHost', { defaultValue: '新增 SSH host' })
      }
      onCancel={onClose}
      footer={
        <div className='flex items-center justify-end gap-8px'>
          <Button onClick={onClose}>{t('common.cancel', { defaultValue: '取消' })}</Button>
          <Button type='primary' loading={saving} onClick={handleSave}>
            {t('settings.compute.saveAndTest', { defaultValue: '保存并测试' })}
          </Button>
        </div>
      }
      style={{ width: 640, maxWidth: 'calc(100vw - 32px)' }}
      unmountOnExit
    >
      <Form form={form} layout='vertical' initialValues={initialValues} autoComplete='off'>
        <div className={styles.formGrid}>
          <Form.Item
            field='name'
            label={t('settings.compute.hostName', { defaultValue: '名称' })}
            rules={[{ required: true, message: t('settings.compute.hostNameRequired', { defaultValue: '请填写名称' }) }]}
          >
            <Input placeholder='GPU workstation' />
          </Form.Item>
          <Form.Item field='port' label={t('settings.compute.port', { defaultValue: '端口' })}>
            <Input type='number' placeholder='22' />
          </Form.Item>
        </div>

        <div className={styles.formGrid}>
          <Form.Item
            field='host'
            label='Host / IP'
            rules={[{ required: true, message: t('settings.compute.hostRequired', { defaultValue: '请填写 Host/IP' }) }]}
          >
            <Input placeholder='192.168.1.20' />
          </Form.Item>
          <Form.Item
            field='username'
            label={t('settings.compute.username', { defaultValue: '用户名' })}
            rules={[{ required: true, message: t('settings.compute.usernameRequired', { defaultValue: '请填写用户名' }) }]}
          >
            <Input placeholder='ubuntu' />
          </Form.Item>
        </div>

        <Form.Item field='authType' label={t('settings.compute.authType', { defaultValue: '认证方式' })}>
          <Select>
            <Select.Option value='password'>{t('settings.compute.authPassword', { defaultValue: '密码' })}</Select.Option>
            <Select.Option value='privateKey'>Private key</Select.Option>
            <Select.Option value='agent'>SSH agent</Select.Option>
          </Select>
        </Form.Item>

        {authType === 'password' ? (
          <Form.Item
            field='password'
            label={t('settings.compute.password', { defaultValue: '密码' })}
            extra={isEditing && host?.hasPassword ? t('settings.compute.passwordKeep', { defaultValue: '已保存密码，留空则保持不变' }) : undefined}
          >
            <Input.Password placeholder={isEditing && host?.hasPassword ? '••••••••' : undefined} visibilityToggle />
          </Form.Item>
        ) : null}

        {authType === 'privateKey' ? (
          <>
            <Form.Item
              field='privateKeyPath'
              label='Private key path'
              rules={[
                { required: true, message: t('settings.compute.privateKeyRequired', { defaultValue: '请填写 private key 路径' }) },
              ]}
            >
              <Input
                placeholder='~/.ssh/id_ed25519'
                suffix={
                  <Button size='mini' type='text' icon={<FolderOpen size='15' />} onClick={handlePickPrivateKey} />
                }
              />
            </Form.Item>
            <Form.Item
              field='privateKeyPassphrase'
              label={t('settings.compute.privateKeyPassphrase', { defaultValue: 'Private key passphrase' })}
              extra={
                isEditing && host?.hasPrivateKeyPassphrase
                  ? t('settings.compute.passwordKeep', { defaultValue: '已保存，留空则保持不变' })
                  : undefined
              }
            >
              <Input.Password visibilityToggle />
            </Form.Item>
          </>
        ) : null}

        <Form.Item field='remoteWorkdir' label={t('settings.compute.remoteWorkdir', { defaultValue: '默认远程工作目录' })}>
          <Input placeholder='~/openscience-workspace' />
        </Form.Item>

        <Form.Item field='tags' label={t('settings.compute.tags', { defaultValue: '标签' })}>
          <Input placeholder='GPU, A100, lab' />
        </Form.Item>

        <Form.Item field='notes' label={t('settings.compute.notes', { defaultValue: '备注' })}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder={t('settings.compute.notesPlaceholder', { defaultValue: '例如：只用于训练任务，避免在白天跑满 GPU。' })} />
        </Form.Item>

        <div className='mb-20px flex items-start justify-between gap-12px'>
          <div>
            <div className='text-13px font-650 text-t-primary'>
              {t('settings.compute.exposeCredentials', { defaultValue: '允许把凭据信息写入 Agent 上下文' })}
            </div>
            <div className='mt-3px text-12px leading-18px text-t-secondary'>
              {t('settings.compute.exposeCredentialsDesc', {
                defaultValue:
                  '关闭时，Agent 只会看到服务器地址、用户名和认证方式；打开后，密码或 passphrase 会随本次会话上下文提供给 Agent。',
              })}
            </div>
          </div>
          <Form.Item field='exposeCredentialsToAgent' triggerPropName='checked' style={{ marginBottom: 0 }}>
            <Switch size='small' />
          </Form.Item>
        </div>

        <div className={styles.hintBox}>
          <span className='mr-5px align-[-2px]'>
            <Info size='14' />
          </span>
          {t('settings.compute.saveHint', {
            defaultValue:
              '点击保存后会自动测试 SSH 连接。测试失败时仍会保留配置，方便你稍后调整网络、密钥或服务器状态。',
          })}
        </div>
      </Form>
    </Modal>
  );
};

export default SshHostModal;
