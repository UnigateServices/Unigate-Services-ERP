import {
  ArgumentsHost,
  Catch,
  Delete,
  ExceptionFilter,
  Get,
  HttpStatus,
  Param,
  PayloadTooLargeException,
  Post,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { MulterError, memoryStorage } from 'multer';
import type { RequestAuth } from '../../auth/auth.service';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { financeActor } from '../finance-access';
import { FinanceRoute } from '../finance-route';
import { AttachmentsService, IncomingFile } from './attachments.service';

@Catch(MulterError, PayloadTooLargeException)
class AttachmentUploadFilter implements ExceptionFilter {
  catch(exception: MulterError | PayloadTooLargeException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const multerCode = exception instanceof MulterError ? exception.code : 'LIMIT_FILE_SIZE';
    const code =
      multerCode === 'LIMIT_FILE_SIZE'
        ? 'FILE_TOO_LARGE'
        : multerCode === 'LIMIT_FILE_COUNT'
          ? 'TOO_MANY_FILES'
          : 'FILE_REQUIRED';
    response.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, code, message: code });
  }
}

@FinanceRoute('attachments')
@UseFilters(AttachmentUploadFilter)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get(':reference')
  list(@CurrentAuth() auth: RequestAuth, @Param('reference') reference: string) {
    return this.attachments.list(financeActor(auth), reference);
  }

  @Post(':reference')
  @UseInterceptors(
    FilesInterceptor('files', 8, {
      storage: memoryStorage(),
      limits: { fileSize: Math.ceil(4.5 * 1024 * 1024) },
    }),
  )
  upload(
    @CurrentAuth() auth: RequestAuth,
    @Param('reference') reference: string,
    @UploadedFiles() files: IncomingFile[],
  ) {
    return this.attachments.upload(financeActor(auth, 'WRITE'), reference, files || []);
  }

  @Get(':reference/:id')
  file(
    @CurrentAuth() auth: RequestAuth,
    @Param('reference') reference: string,
    @Param('id') id: string,
  ) {
    return this.attachments.file(financeActor(auth), reference, id);
  }

  @Delete(':reference/:id')
  remove(
    @CurrentAuth() auth: RequestAuth,
    @Param('reference') reference: string,
    @Param('id') id: string,
  ) {
    return this.attachments.remove(financeActor(auth, 'WRITE'), reference, id);
  }
}
