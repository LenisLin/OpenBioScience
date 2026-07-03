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
      title: t('settings.compute.pickPrivateKey', { defaultValue: 'Select private key file' }),
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
        Message.success(t('settings.compute.saveAndTestSuccess', { defaultValue: 'Server saved and SSH connection test passed' }));
      } else {
        Modal.warning({
          title: t('settings.compute.testFailedTitle', { defaultValue: 'Server saved, but connection test did not pass' }),
          content: result.test.message,
          okText: t('common.confirm', { defaultValue: 'OK' }),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.compute.saveFailed', { defaultValue: 'Save failed' });
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
          ? t('settings.compute.editHost', { defaultValue: 'Edit SSH host' })
          : t('settings.compute.addHost', { defaultValue: 'Add SSH host' })
      }
      onCancel={onClose}
      footer={
        <div className='flex items-center justify-end gap-8px'>
          <Button onClick={onClose}>{t('common.cancel', { defaultValue: 'Cancel' })}</Button>
          <Button type='primary' loading={saving} onClick={handleSave}>
            {t('settings.compute.saveAndTest', { defaultValue: 'Save and test' })}
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
            label={t('settings.compute.hostName', { defaultValue: 'Name' })}
            rules={[{ required: true, message: t('settings.compute.hostNameRequired', { defaultValue: 'Please enter a name' }) }]}
          >
            <Input placeholder='GPU workstation' />
          </Form.Item>
          <Form.Item field='port' label={t('settings.compute.port', { defaultValue: 'Port' })}>
            <Input type='number' placeholder='22' />
          </Form.Item>
        </div>

        <div className={styles.formGrid}>
          <Form.Item
            field='host'
            label='Host / IP'
            rules={[{ required: true, message: t('settings.compute.hostRequired', { defaultValue: 'Please enter Host/IP' }) }]}
          >
            <Input placeholder='192.168.1.20' />
          </Form.Item>
          <Form.Item
            field='username'
            label={t('settings.compute.username', { defaultValue: 'Username' })}
            rules={[{ required: true, message: t('settings.compute.usernameRequired', { defaultValue: 'Please enter a username' }) }]}
          >
            <Input placeholder='ubuntu' />
          </Form.Item>
        </div>

        <Form.Item field='authType' label={t('settings.compute.authType', { defaultValue: 'Authentication' })}>
          <Select>
            <Select.Option value='password'>{t('settings.compute.authPassword', { defaultValue: 'Password' })}</Select.Option>
            <Select.Option value='privateKey'>{t('settings.compute.privateKey', { defaultValue: 'Private key' })}</Select.Option>
            <Select.Option value='agent'>{t('settings.compute.sshAgent', { defaultValue: 'SSH agent' })}</Select.Option>
          </Select>
        </Form.Item>

        {authType === 'password' ? (
          <Form.Item
            field='password'
            label={t('settings.compute.password', { defaultValue: 'Password' })}
            extra={
              isEditing && host?.hasPassword
                ? t('settings.compute.passwordKeep', { defaultValue: 'Already saved. Leave blank to keep unchanged.' })
                : undefined
            }
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
                { required: true, message: t('settings.compute.privateKeyRequired', { defaultValue: 'Please enter a private key path' }) },
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
                  ? t('settings.compute.passwordKeep', { defaultValue: 'Already saved. Leave blank to keep unchanged.' })
                  : undefined
              }
            >
              <Input.Password visibilityToggle />
            </Form.Item>
          </>
        ) : null}

        <Form.Item field='remoteWorkdir' label={t('settings.compute.remoteWorkdir', { defaultValue: 'Default remote workdir' })}>
          <Input placeholder='~/openscience-workspace' />
        </Form.Item>

        <Form.Item field='tags' label={t('settings.compute.tags', { defaultValue: 'Tags' })}>
          <Input placeholder='GPU, A100, lab' />
        </Form.Item>

        <Form.Item field='notes' label={t('settings.compute.notes', { defaultValue: 'Notes' })}>
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder={t('settings.compute.notesPlaceholder', {
              defaultValue: 'For example: training tasks only; avoid saturating GPUs during the day.',
            })}
          />
        </Form.Item>

        <div className='mb-20px flex items-start justify-between gap-12px'>
          <div>
            <div className='text-13px font-650 text-t-primary'>
              {t('settings.compute.exposeCredentials', { defaultValue: 'Allow credentials in Agent context' })}
            </div>
            <div className='mt-3px text-12px leading-18px text-t-secondary'>
              {t('settings.compute.exposeCredentialsDesc', {
                defaultValue:
                  'When off, the Agent only sees server address, username, and authentication type. When on, the password or passphrase can be provided in the session context.',
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
              'Saving automatically tests the SSH connection. Failed tests still keep the configuration so you can adjust the network, key, or server state later.',
          })}
        </div>
      </Form>
    </Modal>
  );
};

export default SshHostModal;
